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
import { getActiveBans, unbanAll, clientIp, recordSecurityEvent } from "../ratelimit";

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

  // پاک‌سازی کامل: حساب‌ها، توکن‌ها، تاریخچه، تنظیمات، نشست‌ها، کدهای پشتیبان، داده‌های امنیتی/تحلیلی
  await db.batch([
    db.prepare("DELETE FROM tracked_orders"),
    db.prepare("DELETE FROM accounts"),
    db.prepare("DELETE FROM app_settings"),
    db.prepare("DELETE FROM backup_codes"),
    db.prepare("DELETE FROM sessions"),
    db.prepare("DELETE FROM login_attempts"),
    db.prepare("DELETE FROM ip_strikes"),
    db.prepare("DELETE FROM price_snapshots"),
    db.prepare("DELETE FROM portfolio_snapshots"),
  ]);

  await revokeAllSessions(c);
  return c.json({ success: true, wiped: true, message: "تمام داده‌ها، توکن‌ها و تنظیمات پاک شدند." });
});

/* --------------------- داشبورد امنیتی (v2) --------------------- */

interface SecurityEventRow {
  id: string;
  type: string;
  ip: string | null;
  user_agent: string | null;
  detail: string | null;
  created_at: number;
}

/** GET /api/security/events — رویدادهای امنیتی اخیر + بن‌های فعال + آمار ۲۴ ساعت */
securityRoutes.get("/events", async (c) => {
  const db = c.env.DB;
  const dayAgo = nowMs() - 24 * 60 * 60_000;

  const [events, bans, failedRow, successRow, sessionsRow] = await Promise.all([
    db
      .prepare("SELECT * FROM security_events ORDER BY created_at DESC LIMIT 100")
      .all<SecurityEventRow>(),
    getActiveBans(db),
    db
      .prepare("SELECT COUNT(*) AS n FROM security_events WHERE type = 'login_failed' AND created_at > ?")
      .bind(dayAgo)
      .first<{ n: number }>(),
    db
      .prepare("SELECT COUNT(*) AS n FROM security_events WHERE type = 'login_success' AND created_at > ?")
      .bind(dayAgo)
      .first<{ n: number }>(),
    db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?").bind(nowMs()).first<{ n: number }>(),
  ]);

  return c.json({
    success: true,
    events: events.results.map((e) => ({
      id: e.id,
      type: e.type,
      ip: e.ip,
      userAgent: e.user_agent,
      detail: e.detail,
      createdAt: new Date(e.created_at).toISOString(),
    })),
    bans,
    stats: {
      failedLogins24h: failedRow?.n ?? 0,
      successfulLogins24h: successRow?.n ?? 0,
      activeBans: bans.length,
      activeSessions: sessionsRow?.n ?? 0,
    },
  });
});

/** POST /api/security/unban — رفع همه بن‌ها و شمارنده‌های تلاش ناموفق */
securityRoutes.post("/unban", async (c) => {
  const db = c.env.DB;
  await unbanAll(db);
  await recordSecurityEvent(db, {
    type: "unban_action",
    ip: clientIp(c.req.header("cf-connecting-ip")),
    userAgent: c.req.header("user-agent"),
    detail: "همه بن‌ها و شمارنده‌ها دستی پاک شدند",
  });
  return c.json({ success: true, message: "همه بن‌ها و شمارنده‌های تلاش ناموفق پاک شدند." });
});

/** GET /api/security/sessions — نشست‌های فعال (نشست فعلی علامت‌گذاری می‌شود) */
securityRoutes.get("/sessions", async (c) => {
  const db = c.env.DB;
  const currentHash = c.get("session").tokenHash;
  const rows = await db
    .prepare("SELECT token_hash, created_at, expires_at, last_seen_at, ip, user_agent FROM sessions WHERE expires_at > ? ORDER BY last_seen_at DESC LIMIT 50")
    .bind(nowMs())
    .all<{
      token_hash: string;
      created_at: number;
      expires_at: number;
      last_seen_at: number;
      ip: string | null;
      user_agent: string | null;
    }>();

  return c.json({
    success: true,
    sessions: rows.results.map((s) => ({
      id: s.token_hash.slice(0, 10),
      current: s.token_hash === currentHash,
      ip: s.ip,
      userAgent: s.user_agent,
      createdAt: new Date(s.created_at).toISOString(),
      expiresAt: new Date(s.expires_at).toISOString(),
      lastSeenAt: new Date(s.last_seen_at).toISOString(),
    })),
  });
});
