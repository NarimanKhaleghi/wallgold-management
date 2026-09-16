/**
 * ثبت اسنپ‌شات‌های تاریخی برای نمودارهای تحلیلی
 *
 * - قیمت‌ها: با هر دریافت بازارها (حداکثر هر ۲ دقیقه یک‌بار) در price_snapshots
 * - دارایی: با هر دریافت موجودی (حداکثر هر ۵ دقیقه یک‌بار) در portfolio_snapshots
 *
 * هرس تنبل: قیمت‌ها ۳۵ روز و دارایی ۹۵ روز نگه داشته می‌شوند تا
 * حجم دیتابیس D1 کنترل‌شده بماند.
 */

import type { D1Database } from "./env";
import { nowMs } from "./db";
import { getMarketsCached, GOLD_SYMBOL, SILVER_SYMBOL, type WgMarket, type WgBalance } from "./wallgold";

export interface BalanceResult {
  ok: boolean;
  balances: WgBalance[];
}

/* ---------------------------- اسنپ‌شات قیمت ---------------------------- */

const PRICE_THROTTLE_MS = 2 * 60_000;
const PRICE_RETENTION_MS = 35 * 24 * 60 * 60_000;

let lastPriceSnap = 0;
let lastPricePrune = 0;

/** ثبت قیمت لحظه‌ای طلا/نقره — throttle دو دقیقه‌ای + هرس تنبل */
export async function recordPriceSnapshots(db: D1Database, markets: WgMarket[]): Promise<void> {
  const now = nowMs();
  if (now - lastPriceSnap < PRICE_THROTTLE_MS) return;
  lastPriceSnap = now;

  const stmts = [];
  for (const m of markets) {
    if (m.symbol !== GOLD_SYMBOL && m.symbol !== SILVER_SYMBOL) continue;
    const price = Number(m.marketCap?.lastPrice ?? 0);
    if (!Number.isFinite(price) || price <= 0) continue;
    stmts.push(
      db
        .prepare("INSERT INTO price_snapshots (symbol, price, buy_price, sell_price, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(
          m.symbol,
          price,
          Number(m.marketCap?.lastBuyPrice ?? 0) || null,
          Number(m.marketCap?.lastSellPrice ?? 0) || null,
          now
        )
    );
  }
  if (stmts.length > 0) await db.batch(stmts);

  if (now - lastPricePrune > 6 * 60 * 60_000) {
    lastPricePrune = now;
    db.prepare("DELETE FROM price_snapshots WHERE created_at < ?")
      .bind(now - PRICE_RETENTION_MS)
      .run()
      .catch(() => {});
  }
}

/* ---------------------------- اسنپ‌شات دارایی ---------------------------- */

const PORTFOLIO_THROTTLE_MS = 5 * 60_000;
const PORTFOLIO_RETENTION_MS = 95 * 24 * 60 * 60_000;

let lastPortfolioSnap = 0;
let lastPortfolioPrune = 0;

/** ثبت ارزش کل دارایی — از موجودی تازه + قیمت کش‌شده بازار محاسبه می‌شود */
export async function recordPortfolioSnapshot(db: D1Database, results: BalanceResult[]): Promise<void> {
  const now = nowMs();
  if (now - lastPortfolioSnap < PORTFOLIO_THROTTLE_MS) return;

  const okResults = results.filter((r) => r.ok);
  if (okResults.length === 0) return;

  const sum = (currency: string): number => {
    let total = 0;
    for (const r of okResults) {
      const b = r.balances.find((x) => x.currency === currency);
      if (b) total += Number(b.amount) || 0;
    }
    return total;
  };

  const gold = sum("GLD_18C_750");
  const silver = sum("SLV_925");
  const tmn = sum("TMN");
  if (gold === 0 && silver === 0 && tmn === 0) return;

  // قیمت‌ها از کش ۱۰ ثانیه‌ای بازارها (بدون رفت‌وبرگشت اضافه به وال‌گلد)
  const markets = await getMarketsCached().catch(() => [] as WgMarket[]);
  const goldPrice = Number(markets.find((m) => m.symbol === GOLD_SYMBOL)?.marketCap?.lastPrice ?? 0) || 0;
  const silverPrice = Number(markets.find((m) => m.symbol === SILVER_SYMBOL)?.marketCap?.lastPrice ?? 0) || 0;

  lastPortfolioSnap = now;
  await db
    .prepare(
      "INSERT INTO portfolio_snapshots (total_value, gold_amount, silver_amount, tmn_amount, gold_value, silver_value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(gold * goldPrice + silver * silverPrice + tmn, gold, silver, tmn, gold * goldPrice, silver * silverPrice, now)
    .run()
    .catch(() => {});

  if (now - lastPortfolioPrune > 12 * 60 * 60_000) {
    lastPortfolioPrune = now;
    db.prepare("DELETE FROM portfolio_snapshots WHERE created_at < ?")
      .bind(now - PORTFOLIO_RETENTION_MS)
      .run()
      .catch(() => {});
  }
}
