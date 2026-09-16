/**
 * مدیریت نشست کاربر:
 * - توکن نشست ۳۲ بایتی تصادفی؛ فقط «هش SHA-256» آن در D1 ذخیره می‌شود
 *   (لو رفتن دیتابیس ≠ ربوده شدن نشست)
 * - انقضای مطلق بر اساس SESSION_TTL_SECONDS (پیش‌فرض ۳۶۰۰ ثانیه = ۱ ساعت)
 * - کوکی HttpOnly + SameSite=Strict + Secure (در HTTPS)
 * - پاک‌سازی تنبل نشست‌های منقضی
 */

import type { Context, Next } from "hono";
import type { AppBindings } from "./env";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { randomToken, sha256Hex } from "./crypto";
import { nowMs } from "./db";

export const SESSION_COOKIE = "wg_session";
const DEFAULT_TTL_SECONDS = 3600; // یک ساعت — طبق نیازمندی

export interface SessionInfo {
  authenticated: true;
  expiresAt: number; // epoch ms
  has2fa: boolean;
  createdAt: number;
}

export function sessionTtlMs(env: { SESSION_TTL_SECONDS?: string }): number {
  const n = Number(env.SESSION_TTL_SECONDS);
  const sec = Number.isFinite(n) && n >= 60 ? Math.floor(n) : DEFAULT_TTL_SECONDS;
  return sec * 1000;
}

/** آیا درخواست روی لوکال اجرا می‌شود (کوکی Secure در http لوکال لازم نیست) */
function isLocalRequest(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  } catch {
    return false;
  }
}

/* ------------------------------- ایجاد نشست ------------------------------- */

export async function createSession(
  c: Context<AppBindings>,
  meta: { has2fa: boolean }
): Promise<{ token: string; expiresAt: number }> {
  const db = c.env.DB;
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const now = nowMs();
  const ttl = sessionTtlMs(c.env);
  const expiresAt = now + ttl;

  await db
    .prepare(
      "INSERT INTO sessions (token_hash, created_at, expires_at, last_seen_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(
      tokenHash,
      now,
      expiresAt,
      now,
      c.req.header("cf-connecting-ip") ?? null,
      (c.req.header("user-agent") ?? "").slice(0, 250)
    )
    .run();

  // پاک‌سازی تنبل نشست‌های منقضی (حداکثر هر ۵ دقیقه یکبار در هر isolate)
  maybePurgeExpired(db, now);

  setSessionCookie(c, token, Math.floor(ttl / 1000));
  return { token, expiresAt };
}

let lastPurge = 0;
function maybePurgeExpired(db: Parameters<typeof createSession>[0]["env"]["DB"], now: number) {
  if (now - lastPurge < 5 * 60 * 1000) return;
  lastPurge = now;
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run().catch(() => {});
}

function setSessionCookie(c: Context<AppBindings>, token: string, maxAgeSec: number) {
  setCookie(c, SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "Strict",
    secure: !isLocalRequest(c.req.url),
    maxAge: maxAgeSec,
  });
}

/* ------------------------------- بررسی نشست ------------------------------- */

export async function getSession(
  c: Context<AppBindings>
): Promise<{ tokenHash: string; expiresAt: number } | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || token.length < 20 || token.length > 200) return null;

  const tokenHash = await sha256Hex(token);
  const row = await c.env.DB
    .prepare("SELECT token_hash, expires_at, last_seen_at FROM sessions WHERE token_hash = ?")
    .bind(tokenHash)
    .first<{ token_hash: string; expires_at: number; last_seen_at: number }>();

  if (!row) return null;
  if (row.expires_at <= nowMs()) {
    // نشست منقضی — حذف فوری
    c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run().catch(() => {});
    return null;
  }

  // به‌روزرسانی last_seen حداکثر یک‌بار در دقیقه (کاهش نوشتن بی‌مورد)
  if (nowMs() - row.last_seen_at > 60_000) {
    c.env.DB
      .prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?")
      .bind(nowMs(), tokenHash)
      .run()
      .catch(() => {});
  }

  return { tokenHash, expiresAt: row.expires_at };
}

/* -------------------------------- خروج -------------------------------- */

export async function revokeSession(c: Context<AppBindings>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const tokenHash = await sha256Hex(token);
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run().catch(() => {});
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/", sameSite: "Strict" });
}

/** حذف همه نشست‌ها به‌جز نشست فعلی */
export async function revokeOtherSessions(c: Context<AppBindings>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return;
  const tokenHash = await sha256Hex(token);
  await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash != ?").bind(tokenHash).run();
}

/** حذف همه نشست‌ها (خروج از همه دستگاه‌ها) */
export async function revokeAllSessions(c: Context<AppBindings>): Promise<void> {
  await c.env.DB.prepare("DELETE FROM sessions").run();
  deleteCookie(c, SESSION_COOKIE, { path: "/", sameSite: "Strict" });
}

export async function countActiveSessions(c: Context<AppBindings>): Promise<number> {
  const row = await c.env.DB
    .prepare("SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?")
    .bind(nowMs())
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/* --------------------------- میان‌افزار احراز هویت --------------------------- */

/** کل روت‌های بعد از ثبت این میان‌افزار نیازمند نشست معتبر هستند */
export async function requireAuth(c: Context<AppBindings>, next: Next) {
  const session = await getSession(c);
  if (!session) {
    return c.json(
      { success: false, message: "نشست شما معتبر نیست یا منقضی شده است. دوباره وارد شوید.", code: 401 },
      401
    );
  }
  c.set("session", session);
  await next();
}
