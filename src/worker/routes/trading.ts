/**
 * روت‌های معاملاتی (نیازمند نشست معتبر)
 *
 * - POST /api/price          دریافت قیمت خصوصی جهت سفارش
 * - POST /api/orders         ثبت سفارش (با اعتبارسنجی کامل سمت سرور)
 * - GET  /api/orders/:id     جزئیات سفارش (accountId به‌صورت query)
 * - POST /api/orders/:id     افزودن دستی orderId به تاریخچه ردیابی
 *
 * نکته مستندات وال‌گلد: TTL قیمت ۳۰ ثانیه از اولین فراخوانی است و
 * با فراخوانی مجدد تمدید نمی‌شود — شمارش معکوس کلاینت بر اساس priceExpiresAt است.
 */

import { Hono, type Context } from "hono";
import type { AppBindings } from "../env";
import type { AccountRow } from "../db";
import { getMasterKey, nowMs } from "../db";
import { aesGcmDecrypt } from "../crypto";
import {
  wgGetPrice,
  wgCreateOrder,
  wgGetOrder,
  wgGetBalances,
  getMarketsCached,
  generateClientId,
  type WgSide,
  type WgOrder,
} from "../wallgold";

export const tradingRoutes = new Hono<AppBindings>();

async function readJson(c: Context<AppBindings>): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

async function getAccount(c: Context<AppBindings>, id: string): Promise<AccountRow | null> {
  return c.env.DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(id).first<AccountRow>();
}

async function accountToken(c: Context<AppBindings>, acc: AccountRow): Promise<string> {
  const masterKey = await getMasterKey(c.env.DB, c.env.ENCRYPTION_KEY);
  const token = await aesGcmDecrypt(masterKey, acc.token_enc);
  if (!token) throw new Error("TOKEN_DECRYPT_FAILED");
  return token;
}

/** اعتبارسنجی مقدار سفارش: مثبت، حداکثر ۳ رقم اعشار */
function validateAmount(raw: unknown): { ok: true; amount: string } | { ok: false; msg: string } {
  const s = typeof raw === "number" ? raw.toString() : String(raw ?? "").trim();
  if (!s) return { ok: false, msg: "مقدار سفارش الزامی است." };
  if (!/^\d+(\.\d{1,3})?$/.test(s)) {
    return { ok: false, msg: "مقدار سفارش باید عدد مثبت با حداکثر ۳ رقم اعشار باشد (مثال: 1.432)." };
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, msg: "مقدار سفارش باید بزرگ‌تر از صفر باشد." };
  return { ok: true, amount: s };
}

/* ------------------------------ قیمت سفارش ------------------------------ */

export const priceRoutes = new Hono<AppBindings>();

priceRoutes.post("/", async (c) => {
  const body = await readJson(c);
  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  const symbol = typeof body.symbol === "string" ? body.symbol : "";
  const side = body.side;

  if (!accountId || !symbol) return c.json({ success: false, message: "شناسه حساب و نماد بازار الزامی است." }, 400);
  if (side !== "buy" && side !== "sell") return c.json({ success: false, message: "سمت معامله باید buy یا sell باشد." }, 400);

  const acc = await getAccount(c, accountId);
  if (!acc) return c.json({ success: false, message: "حساب مورد نظر پیدا نشد." }, 404);

  const token = await accountToken(c, acc);
  const price = await wgGetPrice(token, symbol, side);
  return c.json({ success: true, price, serverNow: new Date().toISOString() });
});

/* ------------------------------ ثبت سفارش ------------------------------ */

/** جلوگیری از ثبت همزمان سفارش تکراری (Race guard درون-isolate) */
const inflightOrders = new Map<string, { symbol: string; side: string; amount: string }>();

tradingRoutes.post("/", async (c) => {
  const body = await readJson(c);
  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  const symbol = typeof body.symbol === "string" ? body.symbol : "";
  const side = body.side as WgSide;

  if (!accountId || !symbol) return c.json({ success: false, message: "شناسه حساب و نماد بازار الزامی است." }, 400);
  if (side !== "buy" && side !== "sell") return c.json({ success: false, message: "سمت سفارش باید buy یا sell باشد." }, 400);

  const amountCheck = validateAmount(body.orderAmount);
  if (!amountCheck.ok) return c.json({ success: false, message: amountCheck.msg }, 400);
  const orderAmount = amountCheck.amount;

  const acc = await getAccount(c, accountId);
  if (!acc) return c.json({ success: false, message: "حساب مورد نظر پیدا نشد." }, 404);

  // ---- بررسی بازار و محدودیت‌ها ----
  const markets = await getMarketsCached();
  const market = markets.find((m) => m.symbol === symbol);
  if (!market) return c.json({ success: false, message: "نماد بازار نامعتبر است." }, 400);

  const sideEnabled = side === "buy" ? market.buyStatus === "enable" : market.sellStatus === "enable";
  if (!sideEnabled) {
    return c.json(
      { success: false, message: `بازار ${market.faName} برای ${side === "buy" ? "خرید" : "فروش"} غیرفعال است.` },
      400
    );
  }

  const qty = Number(orderAmount);
  if (qty < Number(market.minQty)) return c.json({ success: false, message: `حداقل مقدار سفارش ${market.minQty} گرم است.` }, 400);
  if (qty > Number(market.maxQty)) return c.json({ success: false, message: `حداکثر مقدار سفارش ${market.maxQty} گرم است.` }, 400);

  const lastPrice = Number(market.marketCap?.lastPrice ?? 0);
  if (lastPrice > 0 && qty * lastPrice < Number(market.minNotional)) {
    return c.json(
      { success: false, message: `ارزش کل سفارش باید حداقل ${Number(market.minNotional).toLocaleString("fa-IR")} تومان باشد.` },
      400
    );
  }

  // ---- بررسی موجودی (برآوردی؛ مرجع نهایی خطای API وال‌گلد است) ----
  const token = await accountToken(c, acc);
  const balances = await wgGetBalances(token);
  const feeRate = Number(market.otcFeeCoefficient || 0);

  if (side === "buy") {
    const tmn = balances.find((b) => b.currency === "TMN");
    const free = Number(tmn ? Number(tmn.amount) - Number(tmn.locked_amount) : 0);
    const need = qty * lastPrice * (1 + feeRate);
    if (lastPrice > 0 && free < need) {
      return c.json(
        {
          success: false,
          message: `موجودی تومان کافی نیست. مورد نیاز حدود ${Math.ceil(need).toLocaleString("fa-IR")} تومان، موجود: ${free.toLocaleString("fa-IR")} تومان.`,
        },
        400
      );
    }
  } else {
    const asset = balances.find((b) => b.currency === market.baseAsset);
    const free = Number(asset ? Number(asset.amount) - Number(asset.locked_amount) : 0);
    if (free < qty) {
      return c.json(
        { success: false, message: `موجودی آزاد ${market.faBaseAsset} کافی نیست. مورد نیاز: ${orderAmount} گرم، موجود: ${free.toFixed(3)} گرم.` },
        400
      );
    }
  }

  // ---- جلوگیری از درخواست همزمان مشابه ----
  const current = inflightOrders.get(accountId);
  if (current && current.symbol === symbol && current.side === side && current.amount === orderAmount) {
    return c.json({ success: false, message: "سفارش مشابه در حال پردازش است. لطفاً چند لحظه صبر کنید." }, 429);
  }
  inflightOrders.set(accountId, { symbol, side, amount: orderAmount });

  // ---- ثبت سفارش ----
  const clientId = generateClientId();
  let order: WgOrder;
  try {
    order = await wgCreateOrder(token, { symbol, side, orderAmount, clientId });
  } finally {
    inflightOrders.delete(accountId);
  }

  // ---- ثبت در تاریخچه محلی ----
  const now = nowMs();
  await c.env.DB
    .prepare(
      "INSERT INTO tracked_orders (id, account_id, order_id, client_id, created_at, last_status, detail_cache, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(account_id, order_id) DO UPDATE SET last_status = excluded.last_status, detail_cache = excluded.detail_cache, client_id = excluded.client_id, updated_at = excluded.updated_at"
    )
    .bind(crypto.randomUUID(), accountId, order.orderId, order.clientId, now, order.status, JSON.stringify(order), now)
    .run();

  return c.json({ success: true, order }, 201);
});

/* ------------------------- جزئیات / ردیابی سفارش ------------------------- */

tradingRoutes.get("/:orderId", async (c) => {
  const orderId = c.req.param("orderId");
  const accountId = c.req.query("accountId");
  if (!accountId) return c.json({ success: false, message: "شناسه حساب الزامی است." }, 400);

  const acc = await getAccount(c, accountId);
  if (!acc) return c.json({ success: false, message: "حساب مورد نظر پیدا نشد." }, 404);

  const token = await accountToken(c, acc);
  const order = await wgGetOrder(token, orderId);

  const now = nowMs();
  await c.env.DB
    .prepare(
      "INSERT INTO tracked_orders (id, account_id, order_id, client_id, created_at, last_status, detail_cache, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(account_id, order_id) DO UPDATE SET last_status = excluded.last_status, detail_cache = excluded.detail_cache, updated_at = excluded.updated_at"
    )
    .bind(crypto.randomUUID(), accountId, orderId, order.clientId, now, order.status, JSON.stringify(order), now)
    .run();

  return c.json({ success: true, order });
});

tradingRoutes.post("/:orderId", async (c) => {
  const orderId = c.req.param("orderId");
  const body = await readJson(c);
  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  if (!accountId) return c.json({ success: false, message: "شناسه حساب الزامی است." }, 400);

  const acc = await getAccount(c, accountId);
  if (!acc) return c.json({ success: false, message: "حساب مورد نظر پیدا نشد." }, 404);

  // وجود سفارش با API وال‌گلد بررسی می‌شود
  const token = await accountToken(c, acc);
  const order = await wgGetOrder(token, orderId);

  const now = nowMs();
  await c.env.DB
    .prepare(
      "INSERT INTO tracked_orders (id, account_id, order_id, client_id, created_at, last_status, detail_cache, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(account_id, order_id) DO UPDATE SET last_status = excluded.last_status, detail_cache = excluded.detail_cache, updated_at = excluded.updated_at"
    )
    .bind(crypto.randomUUID(), accountId, orderId, order.clientId ?? generateClientId(), now, order.status, JSON.stringify(order), now)
    .run();

  return c.json({ success: true, tracked: true }, 201);
});
