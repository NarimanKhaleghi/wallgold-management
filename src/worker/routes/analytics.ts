/**
 * روت تحلیل و نمودارها (نیازمند نشست معتبر)
 *
 * - GET /api/analytics?range=24h|7d|30d
 *   سری زمانی قیمت طلا/نقره + ارزش دارایی + آمار معاملات با سود/زیان فیفو
 *
 * نمونه‌برداری: ۲۴ ساعت → باکت ۵ دقیقه، ۷ روز → ۳۰ دقیقه، ۳۰ روز → ۲ ساعت
 * (چون اسنپ‌شات قیمت هر ۲ دقیقه و دارایی هر ۵ دقیقه ثبت می‌شود،
 * باکت‌بندی SQL بدون بار اضافه انجام می‌شود.)
 */

import { Hono } from "hono";
import type { AppBindings } from "../env";
import { nowMs } from "../db";
import { getMarketsCached, GOLD_SYMBOL, SILVER_SYMBOL, type WgOrder } from "../wallgold";

export const analyticsRoutes = new Hono<AppBindings>();

const RANGES: Record<string, { ms: number; bucketMs: number }> = {
  "24h": { ms: 24 * 60 * 60_000, bucketMs: 5 * 60_000 },
  "7d": { ms: 7 * 24 * 60 * 60_000, bucketMs: 30 * 60_000 },
  "30d": { ms: 30 * 24 * 60 * 60_000, bucketMs: 2 * 60 * 60_000 },
};

interface PricePointRow {
  symbol: string;
  t: number;
  price: number;
  buy: number | null;
  sell: number | null;
}

analyticsRoutes.get("/", async (c) => {
  const db = c.env.DB;
  const rangeKey = c.req.query("range") ?? "24h";
  const range = RANGES[rangeKey] ?? RANGES["24h"];
  const from = nowMs() - range.ms;

  /* ---------- سری قیمت (باکت‌بندی شده) ---------- */
  const priceRows = await db
    .prepare(
      "SELECT symbol, CAST(created_at / ? AS INTEGER) * ? AS t, AVG(price) AS price, AVG(buy_price) AS buy, AVG(sell_price) AS sell " +
        "FROM price_snapshots WHERE created_at >= ? GROUP BY symbol, t ORDER BY t ASC"
    )
    .bind(range.bucketMs, range.bucketMs, from)
    .all<PricePointRow>();

  const prices = [
    { symbol: GOLD_SYMBOL, points: [] as { t: number; price: number; buy: number | null; sell: number | null }[] },
    { symbol: SILVER_SYMBOL, points: [] as { t: number; price: number; buy: number | null; sell: number | null }[] },
  ];
  for (const r of priceRows.results) {
    const entry = prices.find((p) => p.symbol === r.symbol);
    if (entry) entry.points.push({ t: r.t, price: r.price, buy: r.buy, sell: r.sell });
  }

  /* ---------- سری ارزش دارایی ---------- */
  const portfolioRows = await db
    .prepare(
      "SELECT CAST(created_at / ? AS INTEGER) * ? AS t, AVG(total_value) AS value " +
        "FROM portfolio_snapshots WHERE created_at >= ? GROUP BY t ORDER BY t ASC"
    )
    .bind(range.bucketMs, range.bucketMs, from)
    .all<{ t: number; value: number }>();
  const portfolio = portfolioRows.results.map((r) => ({ t: r.t, value: r.value }));

  /* ---------- آمار معاملات از تاریخچه ردیابی‌شده ---------- */
  const orderRows = await db
    .prepare("SELECT detail_cache FROM tracked_orders WHERE detail_cache IS NOT NULL LIMIT 500")
    .all<{ detail_cache: string }>();

  const orders: WgOrder[] = [];
  for (const r of orderRows.results) {
    try {
      const parsed = JSON.parse(r.detail_cache) as WgOrder;
      if (parsed && typeof parsed.market === "string") orders.push(parsed);
    } catch {
      /* رکورد خراب — نادیده بگیر */
    }
  }

  const markets = await getMarketsCached().catch(() => []);
  const goldPrice = Number(markets.find((m) => m.symbol === GOLD_SYMBOL)?.marketCap?.lastPrice ?? 0) || 0;
  const silverPrice = Number(markets.find((m) => m.symbol === SILVER_SYMBOL)?.marketCap?.lastPrice ?? 0) || 0;

  const trades = {
    gold: computeMarketStats(orders, GOLD_SYMBOL, goldPrice),
    silver: computeMarketStats(orders, SILVER_SYMBOL, silverPrice),
  };

  return c.json({
    success: true,
    range: RANGES[rangeKey] ? rangeKey : "24h",
    prices,
    portfolio,
    trades,
    serverNow: nowMs(),
  });
});

/* --------------------- محاسبه آمار بازار با سود/زیان فیفو --------------------- */

interface MarketStats {
  buyCount: number;
  sellCount: number;
  buyVolume: number; // گرم
  sellVolume: number; // گرم
  buyValue: number; // تومان
  sellValue: number; // تومان
  fees: number; // تومان
  realizedPnl: number; // سود/زیان محقق‌شده (فیفو)
  openLotsQty: number; // گرم باقیمانده در صف خرید
  openLotsCost: number; // بهای تمام‌شده باقیمانده
  unrealizedPnl: number; // سود/زیان بالقوه با قیمت لحظه‌ای
}

function computeMarketStats(orders: WgOrder[], symbol: string, currentPrice: number): MarketStats {
  const stats: MarketStats = {
    buyCount: 0,
    sellCount: 0,
    buyVolume: 0,
    sellVolume: 0,
    buyValue: 0,
    sellValue: 0,
    fees: 0,
    realizedPnl: 0,
    openLotsQty: 0,
    openLotsCost: 0,
    unrealizedPnl: 0,
  };

  const relevant = orders
    .filter((o) => o.market === symbol && o.status === "finished")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const lots: { qty: number; price: number }[] = [];

  for (const o of relevant) {
    const qty = Number(o.filledAmount || o.amount) || 0;
    const price = Number(o.price) || 0;
    const total = Number(o.totalPrice) || qty * price;
    stats.fees += Number(o.otcFee) || 0;

    if (o.side === "buy") {
      stats.buyCount++;
      stats.buyVolume += qty;
      stats.buyValue += total;
      lots.push({ qty, price });
    } else if (o.side === "sell") {
      stats.sellCount++;
      stats.sellVolume += qty;
      stats.sellValue += total;
      // تطبیق فیفو با لات‌های خرید
      let remaining = qty;
      while (remaining > 1e-9 && lots.length > 0) {
        const lot = lots[0];
        const take = Math.min(remaining, lot.qty);
        stats.realizedPnl += (price - lot.price) * take;
        lot.qty -= take;
        remaining -= take;
        if (lot.qty <= 1e-9) lots.shift();
      }
    }
  }

  stats.openLotsQty = lots.reduce((s, l) => s + l.qty, 0);
  stats.openLotsCost = lots.reduce((s, l) => s + l.qty * l.price, 0);
  if (currentPrice > 0) {
    stats.unrealizedPnl = stats.openLotsQty * currentPrice - stats.openLotsCost;
  }
  return stats;
}
