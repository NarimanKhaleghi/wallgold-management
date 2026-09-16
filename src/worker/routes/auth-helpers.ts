/**
 * توابع مشترک احراز هویت — استفاده در روت‌های auth و عملیات حساس (مثل پاک‌سازی)
 */

import type { AppBindings } from "../env";
import { getSetting, getMasterKey } from "../db";
import { aesGcmDecrypt, sha256Hex } from "../crypto";
import { verifyTotp } from "../totp";

/** رمزگشایی راش TOTP از دیتابیس */
export async function readTotpSecret(
  db: AppBindings["Bindings"]["DB"],
  env: AppBindings["Bindings"],
  key: string
): Promise<string | null> {
  const enc = await getSetting(db, key);
  if (!enc) return null;
  const masterKey = await getMasterKey(db, env.ENCRYPTION_KEY);
  return aesGcmDecrypt(masterKey, enc);
}

/**
 * بررسی کد ورود دومرحله‌ای: کد ۶ رقمی (TOTP) یا کد پشتیبان ۱۰ کاراکتری
 * @returns true اگر کد معتبر بود
 */
export async function verifySecondFactor(
  db: AppBindings["Bindings"]["DB"],
  env: AppBindings["Bindings"],
  code: string
): Promise<boolean> {
  const clean = code.replace(/[\s-]/g, "");

  // کد ۶ رقمی → TOTP
  if (/^\d{6}$/.test(clean)) {
    const secret = await readTotpSecret(db, env, "auth.totp_secret");
    if (!secret) return false;
    return verifyTotp(secret, clean);
  }

  // کد پشتیبان (۱۰ کاراکتر) — یک‌بارمصرف
  if (/^[a-z2-9]{10}$/i.test(clean)) {
    const codeHash = await sha256Hex(clean.toLowerCase());
    const row = await db
      .prepare("SELECT used FROM backup_codes WHERE code_hash = ?")
      .bind(codeHash)
      .first<{ used: number }>();
    if (!row || row.used === 1) return false;
    await db.prepare("UPDATE backup_codes SET used = 1 WHERE code_hash = ?").bind(codeHash).run();
    return true;
  }

  return false;
}
