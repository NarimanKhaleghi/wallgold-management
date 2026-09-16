/**
 * محدودسازی نرخ (Rate Limiting) مبتنی بر D1 — دفاع در برابر Brute Force
 *
 * - ورودی ناموفق: حداکثر ۵ تلاش در ۱۰ دقیقه از هر IP → قفل ۱۵ دقیقه
 * - کد 2FA ناموفق: حداکثر ۱۰ تلاش در ۵ دقیقه از هر IP → قفل ۱۵ دقیقه
 * - با هر ورود موفق، شمارنده‌ها پاک می‌شوند
 *
 * نکته: این لایه «تاخیر/قفل» مبتنی بر IP است؛ در سطح جهانی نیز PBKDF2
 * و فضای ۶ رقمی TOTP با پنجره ±۱ به‌طور ذاتی حمله آفلاین را غیرممکن می‌کند
 * (مهاجم نمی‌تواند بدون دسترسی به دیتابیس حدس بزند).
 */

import type { D1Database } from "./env";
import { nowMs } from "./db";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number; // در صورت قفل، ثانیه تا آزاد شدن
}

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

export async function recordFailure(db: D1Database, key: string, windowMs: number): Promise<void> {
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
  } else {
    await db
      .prepare("UPDATE login_attempts SET count = count + 1 WHERE key = ?")
      .bind(key)
      .run();
  }
}

export async function clearFailures(db: D1Database, key: string): Promise<void> {
  await db.prepare("DELETE FROM login_attempts WHERE key = ?").bind(key).run().catch(() => {});
}

/** IP کلاینت — در Cloudflare همیشه از این هدر معتبر استفاده می‌شود */
export function clientIp(header: string | undefined): string {
  return (header ?? "unknown").slice(0, 60);
}
