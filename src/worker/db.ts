/**
 * لایه دسترسی به D1 + راه‌اندازی خودکار اسکیما
 *
 * نکته استقرار: همه جداول با CREATE TABLE IF NOT EXISTS ساخته می‌شوند،
 * بنابراین پس از ایجاد D1 (دستی یا با دکمه Deploy) هیچ SQL دستی لازم نیست —
 * اولین درخواست، اسکیمای دیتابیس را به‌صورت idempotent آماده می‌کند.
 */

import type { D1Database } from "./env";
import { randomBytes, bytesToB64url, b64urlToBytes } from "./crypto";

export const SCHEMA_VERSION = 2;

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    token_enc TEXT NOT NULL,
    visible INTEGER NOT NULL DEFAULT 1,
    last_check_ok INTEGER,
    last_check_msg TEXT,
    last_checked_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tracked_orders (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    client_id TEXT,
    created_at INTEGER NOT NULL,
    last_status TEXT,
    detail_cache TEXT,
    updated_at INTEGER NOT NULL,
    UNIQUE(account_id, order_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tracked_account ON tracked_orders(account_id)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    ip TEXT,
    user_agent TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    window_start INTEGER NOT NULL,
    locked_until INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS backup_codes (
    code_hash TEXT PRIMARY KEY,
    used INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  /* --- v2: دفاع سایبری و تحلیل --- */
  `CREATE TABLE IF NOT EXISTS security_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT,
    detail TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sec_events_time ON security_events(created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS ip_strikes (
    ip TEXT PRIMARY KEY,
    strikes INTEGER NOT NULL DEFAULT 0,
    last_strike INTEGER NOT NULL,
    banned_until INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS price_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    price REAL NOT NULL,
    buy_price REAL,
    sell_price REAL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_price_snap ON price_snapshots(symbol, created_at)`,
  `CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total_value REAL NOT NULL,
    gold_amount REAL NOT NULL,
    silver_amount REAL NOT NULL,
    tmn_amount REAL NOT NULL,
    gold_value REAL NOT NULL,
    silver_value REAL NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_portfolio_snap ON portfolio_snapshots(created_at)`,
  `INSERT INTO app_meta (key, value) VALUES ('schema_version', '2') ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
];

/* اجرای یک‌باره اسکیما در هر isolate (idempotent) */
const schemaPromise = new WeakMap<D1Database, Promise<void>>();

export function ensureSchema(db: D1Database): Promise<void> {
  let p = schemaPromise.get(db);
  if (!p) {
    p = (async () => {
      // batch هر دستور را جداگانه و تراکنشی اجرا می‌کند
      await db.batch(DDL.map((stmt) => db.prepare(stmt)));
    })().catch((e) => {
      // در صورت خطا، پرامیس کش نشود تا درخواست بعدی دوباره تلاش کند
      schemaPromise.delete(db);
      throw e;
    });
    schemaPromise.set(db, p);
  }
  return p;
}

export function nowMs(): number {
  return Date.now();
}

/* --------------------------- تنظیمات (کلید/مقدار) --------------------------- */

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM app_settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare(
      "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .bind(key, value, nowMs())
    .run();
}

export async function deleteSetting(db: D1Database, key: string): Promise<void> {
  await db.prepare("DELETE FROM app_settings WHERE key = ?").bind(key).run();
}

/* ------------------------------ کلید اصلی AES ------------------------------ */

/**
 * کلید اصلی رمزنگاری توکن‌ها:
 * ۱) اگر ENCRYPTION_KEY (base64) در محیط تنظیم شده باشد → همان (توصیه‌شده برای پروداکشن)
 * ۲) در غیر این صورت یک کلید ۳۲ بایتی تصادفی در اولین اجرا تولید و در app_meta ذخیره می‌شود
 *    (D1 فقط از طریق همین Worker قابل دسترسی است؛ برای بیشترین جداسازی، Secret تنظیم کنید)
 */
const masterKeyCache = new WeakMap<D1Database, Promise<Uint8Array>>();

export function getMasterKey(db: D1Database, envEncryptionKey?: string): Promise<Uint8Array> {
  if (envEncryptionKey) {
    const bytes = b64urlToBytes(envEncryptionKey.replace(/^base64:/, "").replace(/=+$/, ""));
    if (bytes.length === 32) return Promise.resolve(bytes);
    throw new Error("ENCRYPTION_KEY must be exactly 32 bytes (base64)");
  }
  let p = masterKeyCache.get(db);
  if (!p) {
    p = (async () => {
      const row = await db.prepare("SELECT value FROM app_meta WHERE key = 'master_key'").first<{ value: string }>();
      if (row?.value) {
        const bytes = b64urlToBytes(row.value);
        if (bytes.length === 32) return bytes;
      }
      const key = randomBytes(32);
      const b64 = bytesToB64url(key);
      await db
        .prepare(
          "INSERT INTO app_meta (key, value) VALUES ('master_key', ?) " +
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        )
        .bind(b64)
        .run();
      return key;
    })().catch((e) => {
      masterKeyCache.delete(db);
      throw e;
    });
    masterKeyCache.set(db, p);
  }
  return p;
}

/* --------------------------- حساب‌ها (بدون توکن) --------------------------- */

export interface AccountRow {
  id: string;
  name: string;
  token_enc: string;
  visible: number;
  last_check_ok: number | null;
  last_check_msg: string | null;
  last_checked_at: number | null;
  created_at: number;
  updated_at: number;
}

/** مدل عمومی حساب که به کلاینت برمی‌گردد — توکن هرگز افشا نمی‌شود */
export function publicAccount(a: AccountRow) {
  return {
    id: a.id,
    name: a.name,
    visible: a.visible === 1,
    lastCheckOk: a.last_check_ok === null ? null : a.last_check_ok === 1,
    lastCheckMsg: a.last_check_msg,
    lastCheckedAt: a.last_checked_at ? new Date(a.last_checked_at).toISOString() : null,
    createdAt: new Date(a.created_at).toISOString(),
  };
}
