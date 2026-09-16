/**
 * روت‌های تاریخچه سفارشات، تنظیمات و پاک‌سازی امن (نیازمند نشست معتبر)
 *
 * - GET    /api/history?refresh=1   تاریخچه محلی + به‌روزرسانی وضعیت‌ها از وال‌گلد
 * - DELETE /api/history?id=         حذف رکورد از تاریخچه محلی
 * - GET    /api/settings            خواندن تنظیمات (فقط کلیدهای عمومی)
 * - PATCH  /api/settings            ذخیره تنظیمات عمومی
 * - POST   /api/security/wipe       پاک‌سازی کامل (رمز + کد 2FA الزامی)
 */

import { Hono, type Context } from "hono";
import type { AppBindings } from "../env";
import type { AccountRow } from "../db";
import { getMasterKey, nowMs } from "../db";
import { aesGcmDecrypt } from "../crypto";
import { verifyPassword } from "../crypto";
import { wgGetOrder } from "../wallgold";
import { getSettings, saveSettings } from "../settings";
import { getAuthState } from "./auth";
import { revokeAllSessions } from "../sessions";

/* -------------------------------- تاریخچه -------------------------------- */

interface TrackedOrderRow {
  id: string;
  account_id: string;
  order_id: string;
  client_id: string | null;
  created_at: number;
  last_status: string | null;
  detail_cache: string | null;
  updated_at: number;
}

function serializeTracked(t: TrackedOrderRow, accountName: string) {
  let detail: unknown = null;
  try {
    detail = t.detail_cache ? JSON.parse(t.detail_cache) : null;
  } catch {
    detail = null;
  }
  return {
    id: t.id,
    accountId: t.account_id,
    accountName,
    orderId: t.order_id,
    clientId: t.client_id,
    lastStatus: t.last_status,
    detail,
    createdAt: new Date(t.created_at).toISOString(),
    updatedAt: new Date(t.updated_at).toISOString(),
  };
}

export const historyRoutes = new Hono<AppBindings>();

historyRoutes.get("/", async (c) => {
  const refresh = c.req.query("refresh") === "1";
  const db = c.env.DB;

  const accounts = await db.prepare("SELECT * FROM accounts").all<AccountRow>();
  const accMap = new Map(accounts.results.map((a) => [a.id, a]));

  let tracked = (
    await db.prepare("SELECT * FROM tracked_orders ORDER BY created_at DESC LIMIT 200").all<TrackedOrderRow>()
  ).results;

  if (refresh) {
    const masterKey = await getMasterKey(db, c.env.ENCRYPTION_KEY);
    const targets = tracked.slice(0, 50);
    await Promise.allSettled(
      targets.map(async (t) => {
        const acc = accMap.get(t.account_id);
        if (!acc) return;
        try {
          const token = await aesGcmDecrypt(masterKey, acc.token_enc);
          if (!token) return;
          const order = await wgGetOrder(token, t.order_id);
          await db
            .prepare("UPDATE tracked_orders SET last_status = ?, detail_cache = ?, updated_at = ? WHERE id = ?")
            .bind(order.status, JSON.stringify(order), nowMs(), t.id)
            .run();
        } catch {
          // سفارش در دسترس نبود — وضعیت قبلی حفظ می‌شود
        }
      })
    );
    tracked = (
      await db.prepare("SELECT * FROM tracked_orders ORDER BY created_at DESC LIMIT 200").all<TrackedOrderRow>()
    ).results;
  }

  return c.json({
    success: true,
    orders: tracked.map((t) => serializeTracked(t, accMap.get(t.account_id)?.name ?? "حساب حذف‌شده")),
  });
});

historyRoutes.delete("/", async (c) => {
  const id = c.req.query("id");
  if (!id) return c.json({ success: false, message: "شناسه رکورد الزامی است." }, 400);
  await c.env.DB.prepare("DELETE FROM tracked_orders WHERE id = ?").bind(id).run();
  return c.json({ success: true, deleted: true });
});

/* -------------------------------- تنظیمات -------------------------------- */

export const settingsRoutes = new Hono<AppBindings>();

settingsRoutes.get("/", async (c) => {
  const settings = await getSettings(c.env.DB);
  return c.json({ success: true, settings });
});

settingsRoutes.patch("/", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const changed = await saveSettings(c.env.DB, body);
  const settings = await getSettings(c.env.DB);
  return c.json({ success: true, settings, changed });
});

/* ------------------------------ پاک‌سازی امن ------------------------------ */

export const securityRoutes = new Hono<AppBindings>();

securityRoutes.post("/wipe", async (c) => {
  const db = c.env.DB;

  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const password = typeof body.password === "string" ? body.password : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";

  // تأیید هویت کامل: رمز عبور (+ کد 2FA در صورت فعال بودن)
  const { getSetting } = await import("../db");
  const stored = await getSetting(db, "auth.password_hash");
  if (!stored || !(await verifyPassword(password, stored))) {
    return c.json({ success: false, message: "رمز عبور نادرست است." }, 401);
  }

  const state = await getAuthState(db);
  if (state.has2fa) {
    const { verifySecondFactor } = await import("./auth-helpers");
    if (!(await verifySecondFactor(db, c.env, code))) {
      return c.json({ success: false, message: "کد تأیید دومرحله‌ای نامعتبر است." }, 401);
    }
  }

  // پاک‌سازی کامل: حساب‌ها، توکن‌ها، تاریخچه، تنظیمات، نشست‌ها، کدهای پشتیبان
  await db.batch([
    db.prepare("DELETE FROM tracked_orders"),
    db.prepare("DELETE FROM accounts"),
    db.prepare("DELETE FROM app_settings"),
    db.prepare("DELETE FROM backup_codes"),
    db.prepare("DELETE FROM sessions"),
    db.prepare("DELETE FROM login_attempts"),
  ]);

  await revokeAllSessions(c);
  return c.json({ success: true, wiped: true, message: "تمام داده‌ها، توکن‌ها و تنظیمات پاک شدند." });
});
