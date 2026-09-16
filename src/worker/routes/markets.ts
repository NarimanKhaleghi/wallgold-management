/**
 * روت‌های داده بازار و موجودی (نیازمند نشست معتبر)
 *
 * - GET /api/markets        بازارها با کش ۱۰ ثانیه‌ای (پروکسی امن)
 * - GET /api/balances       موجودی حساب‌های نمایان (موازی)
 */

import { Hono, type Context } from "hono";
import type { AppBindings } from "../env";
import type { AccountRow } from "../db";
import { getMasterKey, nowMs } from "../db";
import { aesGcmDecrypt } from "../crypto";
import { getMarketsCached, wgGetBalances, type WgBalance } from "../wallgold";
import { recordPriceSnapshots, recordPortfolioSnapshot } from "../snapshots";

export const marketRoutes = new Hono<AppBindings>();

/** GET /api/markets — پروکسی بازارهای وال‌گلد (کش ۱۰ ثانیه‌ای) + ثبت اسنپ‌شات قیمت */
marketRoutes.get("/", async (c) => {
  const force = c.req.query("force") === "1";
  const markets = await getMarketsCached(force);
  // ثبت تاریخی قیمت برای نمودارها — غیرمسدودکننده (هر ۲ دقیقه حداکثر یک‌بار)
  recordPriceSnapshots(c.env.DB, markets).catch(() => {});
  return c.json({ success: true, markets, serverTime: new Date().toISOString() });
});

/* --------------------------------- موجودی --------------------------------- */

export interface AccountBalancesResult {
  accountId: string;
  name: string;
  ok: boolean;
  error?: string;
  balances: WgBalance[];
  fetchedAt: string;
}

async function fetchForAccount(
  c: Context<AppBindings>,
  acc: { id: string; name: string; token_enc: string }
): Promise<AccountBalancesResult> {
  try {
    const masterKey = await getMasterKey(c.env.DB, c.env.ENCRYPTION_KEY);
    const token = await aesGcmDecrypt(masterKey, acc.token_enc);
    if (!token) throw new Error("توکن رمزگشایی نشد");
    const balances = await wgGetBalances(token);
    return { accountId: acc.id, name: acc.name, ok: true, balances, fetchedAt: new Date().toISOString() };
  } catch (e) {
    return {
      accountId: acc.id,
      name: acc.name,
      ok: false,
      error: e instanceof Error ? e.message : "خطای نامشخص",
      balances: [],
      fetchedAt: new Date().toISOString(),
    };
  }
}

/** GET /api/balances?accountId= — موجودی یک یا همه حساب‌های نمایان (موازی) */
export async function balancesHandler(c: Context<AppBindings>) {
  const accountId = c.req.query("accountId");

  const rows = accountId
    ? await c.env.DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(accountId).all<AccountRow>()
    : await c.env.DB
        .prepare("SELECT * FROM accounts WHERE visible = 1 ORDER BY created_at ASC")
        .all<AccountRow>();

  if (accountId && rows.results.length === 0) {
    return c.json({ success: false, message: "حساب مورد نظر پیدا نشد." }, 404);
  }

  const results = await Promise.all(rows.results.map((acc) => fetchForAccount(c, acc)));

  // ثبت تاریخی ارزش دارایی برای نمودارها — غیرمسدودکننده (هر ۵ دقیقه حداکثر یک‌بار)
  if (!accountId) {
    recordPortfolioSnapshot(
      c.env.DB,
      results.map((r) => ({ ok: r.ok, balances: r.balances }))
    ).catch(() => {});
  }

  return c.json({ success: true, results });
}

export const balanceRoutes = new Hono<AppBindings>();
balanceRoutes.get("/", balancesHandler);
