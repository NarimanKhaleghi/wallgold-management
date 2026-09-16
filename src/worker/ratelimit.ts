/**
 * لایه دفاع سایبری — Rate Limiting + بن IP پلکانی + لاگ رویدادهای امنیتی
 *
 * سه لایه دفاع:
 *  ۱) Rate Limit مبتنی بر D1 (ماندگار بین ایزولت‌ها):
 *     - ورود ناموفق: حداکثر ۵ تلاش در ۱۰ دقیقه از هر IP → قفل ۱۵ دقیقه
 *     - کد 2FA ناموفق: حداکثر ۱۰ تلاش در ۵ دقیقه از هر IP → قفل ۱۵ دقیقه
 *  ۲) بن IP پلکانی (ip_strikes):
 *     هر بار که آستانه تلاش ناموفق شکسته شود یک «اخطار» ثبت می‌شود:
 *     اخطار ۱ → بن ۱۵ دقیقه، ۲ → ۱ ساعت، ۳ → ۶ ساعت، ۴+ → ۲۴ ساعت
 *     با ورود موفق، اخطارها پاک می‌شوند.
 *  ۳) Rate Limit درون-ایزولته (حافظه، بدون D1):
 *     سقف کلی درخواست‌ها به ازای هر IP در هر ایزولت — دفاع اولیه ضد اسکن/فلود.
 *
 * رویدادهای امنیتی (login_failed، ip_banned، bot_blocked و…) در جدول
 * security_events ثبت و در داشبورد امنیتی به کاربر نمایش داده می‌شوند.
 */

import type { D1Database } from "./env";
import { nowMs } from "./db";
import { randomToken } from "./crypto";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number; // در صورت قفل، ثانیه تا آزاد شدن
}

/* ------------------------- Rate Limit مبتنی بر D1 ------------------------- */

export async function checkRateLimit(
  db: D1Database,
  key: string,
  maxAttempts: number,
  windowMs: number,
  lockMs: number
): Promise<RateLimitResult> {
  const now = nowMs();
  const row = await db
    .prepare("SELECT count, window_start, locked_until FROM login_attempts WHERE key = ?")
    .bind(key)
    .first<{ count: number; window_start: number; locked_until: number | null }>();

  if (!row) return { allowed: true, retryAfterSec: 0 };

  // قفل فعال
  if (row.locked_until && row.locked_until > now) {
    return { allowed: false, retryAfterSec: Math.ceil((row.locked_until - now) / 1000) };
  }

  // پنجره گذشته → شمارنده ریست می‌شود
  if (now - row.window_start > windowMs) return { allowed: true, retryAfterSec: 0 };

  if (row.count >= maxAttempts) {
    const lockedUntil = now + lockMs;
    await db
      .prepare("UPDATE login_attempts SET locked_until = ? WHERE key = ?")
      .bind(lockedUntil, key)
      .run();
    return { allowed: false, retryAfterSec: Math.ceil(lockMs / 1000) };
  }

  return { allowed: true, retryAfterSec: 0 };
}

/** ثبت یک تلاش ناموفق — تعداد تلاش‌های پشت‌سرهم را برمی‌گرداند */
export async function recordFailure(db: D1Database, key: string, windowMs: number): Promise<number> {
  const now = nowMs();
  const row = await db
    .prepare("SELECT count, window_start FROM login_attempts WHERE key = ?")
    .bind(key)
    .first<{ count: number; window_start: number }>();

  if (!row || now - row.window_start > windowMs) {
    await db
      .prepare(
        "INSERT INTO login_attempts (key, count, window_start, locked_until) VALUES (?, 1, ?, NULL) " +
          "ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start, locked_until = NULL"
      )
      .bind(key, now)
      .run();
    return 1;
  }
  await db
    .prepare("UPDATE login_attempts SET count = count + 1 WHERE key = ?")
    .bind(key)
    .run();
  return row.count + 1;
}

export async function clearFailures(db: D1Database, key: string): Promise<void> {
  await db.prepare("DELETE FROM login_attempts WHERE key = ?").bind(key).run().catch(() => {});
}

/** IP کلاینت — در Cloudflare همیشه از این هدر معتبر استفاده می‌شود */
export function clientIp(header: string | undefined): string {
  return (header ?? "unknown").slice(0, 60);
}

/* ---------------------------- بن IP پلکانی (v2) ---------------------------- */

const BAN_LADDER_MS = [
  15 * 60_000, // اخطار ۱ → ۱۵ دقیقه
  60 * 60_000, // اخطار ۲ → ۱ ساعت
  6 * 60 * 60_000, // اخطار ۳ → ۶ ساعت
  24 * 60 * 60_000, // اخطار ۴+ → ۲۴ ساعت
];

export interface BanState {
  banned: boolean;
  retryAfterSec: number;
  strikes: number;
}

/** بررسی وضعیت بن IP — قبل از پردازش هر درخواست احراز هویت صدا زده می‌شود */
export async function checkIpBan(db: D1Database, ip: string): Promise<BanState> {
  const row = await db
    .prepare("SELECT strikes, banned_until FROM ip_strikes WHERE ip = ?")
    .bind(ip)
    .first<{ strikes: number; banned_until: number | null }>();
  if (!row) return { banned: false, retryAfterSec: 0, strikes: 0 };
  if (row.banned_until && row.banned_until > nowMs()) {
    return { banned: true, retryAfterSec: Math.ceil((row.banned_until - nowMs()) / 1000), strikes: row.strikes };
  }
  return { banned: false, retryAfterSec: 0, strikes: row.strikes };
}

/**
 * ثبت یک اخطار (عبور از آستانه تلاش‌های ناموفق) و اعمال بن پلکانی.
 * مدت بن برگردانده می‌شود تا در رویداد ثبت شود.
 */
export async function addStrike(db: D1Database, ip: string): Promise<number> {
  const now = nowMs();
  const row = await db
    .prepare("SELECT strikes FROM ip_strikes WHERE ip = ?")
    .bind(ip)
    .first<{ strikes: number }>();
  const strikes = (row?.strikes ?? 0) + 1;
  const banMs = BAN_LADDER_MS[Math.min(strikes, BAN_LADDER_MS.length) - 1];
  const bannedUntil = now + banMs;
  await db
    .prepare(
      "INSERT INTO ip_strikes (ip, strikes, last_strike, banned_until) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(ip) DO UPDATE SET strikes = excluded.strikes, last_strike = excluded.last_strike, banned_until = excluded.banned_until"
    )
    .bind(ip, strikes, now, bannedUntil)
    .run();
  return banMs;
}

/** پاک‌سازی اخطارها و بن‌های یک IP (پس از ورود موفق) */
export async function clearStrikes(db: D1Database, ip: string): Promise<void> {
  await db.prepare("DELETE FROM ip_strikes WHERE ip = ?").bind(ip).run().catch(() => {});
}

/** لیست بن‌های فعال برای داشبورد امنیتی */
export async function getActiveBans(db: D1Database): Promise<
  { ip: string; strikes: number; bannedUntil: number }[]
> {
  const rows = await db
    .prepare("SELECT ip, strikes, banned_until FROM ip_strikes WHERE banned_until > ? ORDER BY banned_until DESC LIMIT 50")
    .bind(nowMs())
    .all<{ ip: string; strikes: number; banned_until: number }>();
  return rows.results.map((r) => ({ ip: r.ip, strikes: r.strikes, bannedUntil: r.banned_until }));
}

/** رفع همه بن‌ها و شمارنده‌ها (دستی، از داشبورد امنیتی) */
export async function unbanAll(db: D1Database): Promise<void> {
  await db.batch([db.prepare("DELETE FROM ip_strikes"), db.prepare("DELETE FROM login_attempts")]);
}

/* ------------------------ Rate Limit درون-ایزولته ------------------------ */

const memBuckets = new Map<string, { count: number; windowStart: number }>();

/**
 * سقف نرخ درخواست در حافظه ایزولت جاری (بدون رفت‌وبرگشت به D1).
 * در Cloudflare هر ایزولت مستقل شمارش می‌کند؛ لایه D1 برای مسیرهای حساس
 * همچنان ماندگار است — این لایه فقط ضد فلود/اسکن سریع است.
 */
export function inMemoryRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = nowMs();
  let b = memBuckets.get(key);
  if (!b || now - b.windowStart > windowMs) {
    b = { count: 1, windowStart: now };
    memBuckets.set(key, b);
    // جلوگیری از رشد بی‌نهایت حافظه
    if (memBuckets.size > 5000) {
      for (const [k, v] of memBuckets) {
        if (now - v.windowStart > windowMs) memBuckets.delete(k);
      }
    }
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

/* --------------------------- ضد ربات (هیوریستیک) --------------------------- */

/** امضاهای ابزارهای حمله/اسکن شناخته‌شده */
const BAD_BOT_RE =
  /(sqlmap|nikto|nmap|masscan|zgrab|dirbuster|dirb|wpscan|hydra|metasploit|acunetix|nessus|burpsuite|go-http-client|libwww-perl|python-urllib)/i;

export function isBadBot(userAgent: string | undefined): boolean {
  if (!userAgent) return false; // بعضی کلاینت‌های معتبر UA نمی‌فرستند — فقط لیست سیاه فعال است
  return BAD_BOT_RE.test(userAgent);
}

/* -------------------------- رویدادهای امنیتی (v2) -------------------------- */

export type SecurityEventType =
  | "login_failed"
  | "login_success"
  | "totp_failed"
  | "setup_completed"
  | "password_changed"
  | "2fa_enabled"
  | "2fa_disabled"
  | "rate_limited"
  | "ip_banned"
  | "banned_access"
  | "bot_blocked"
  | "csrf_blocked"
  | "unban_action"
  | "wipe_executed"
  | "logout_all";

/** نوع + IP یکتا برای ضد-اسپم لاگ (حداقل ۵ ثانیه فاصله در هر ایزولت) */
const eventThrottle = new Map<string, number>();

export interface SecurityEventInput {
  type: SecurityEventType;
  ip?: string;
  userAgent?: string;
  detail?: string;
  /** ضد اسپم: رویدادهای تکراری همان type+ip در ۵ ثانیه ثبت نمی‌شوند */
  throttle?: boolean;
}

/** ثبت رویداد امنیتی + هرس تنبل (نگهداری حداکثر ۶۰۰ رکورد) */
export async function recordSecurityEvent(db: D1Database, ev: SecurityEventInput): Promise<void> {
  const now = nowMs();
  if (ev.throttle !== false) {
    const tkey = `${ev.type}:${ev.ip ?? ""}`;
    const last = eventThrottle.get(tkey) ?? 0;
    if (now - last < 5_000) return;
    eventThrottle.set(tkey, now);
    if (eventThrottle.size > 3000) eventThrottle.clear();
  }
  const id = randomToken(16);
  await db
    .prepare("INSERT INTO security_events (id, type, ip, user_agent, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, ev.type, ev.ip ?? null, (ev.userAgent ?? "").slice(0, 250) || null, ev.detail ? ev.detail.slice(0, 200) : null, now)
    .run()
    .catch(() => {});
  maybePruneEvents(db, now);
}

let lastEventPrune = 0;
function maybePruneEvents(db: D1Database, now: number) {
  if (now - lastEventPrune < 10 * 60_000) return;
  lastEventPrune = now;
  db.prepare(
    "DELETE FROM security_events WHERE id NOT IN (SELECT id FROM security_events ORDER BY created_at DESC LIMIT 600)"
  )
    .run()
    .catch(() => {});
}
