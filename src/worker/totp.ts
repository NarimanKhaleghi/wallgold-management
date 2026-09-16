/**
 * پیاده‌سازی TOTP مطابق RFC 6238 + HOTP مطابق RFC 4226
 * سازگار با Google Authenticator، Microsoft Authenticator، Authy، Aegis و 1Password.
 *
 * - الگوریتم: HMAC-SHA1 (استاندارد همه اپ‌های Authenticator)
 * - ۶ رقم، بازه زمانی ۳۰ ثانیه، پنجره تحمل ±۱ (برای انحراف ساعت)
 * - راز ۲۰ بایتی (base32 با ۳۲ کاراکتر)
 */

import { randomBytes } from "./crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** رمزگذاری base32 (RFC 4648 — بدون padding) */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

/** رمزگشایی base32 — در صورت ورودی نامعتبر null */
export function base32Decode(input: string): Uint8Array | null {
  const clean = input.replace(/[\s=-]/g, "").toUpperCase();
  if (!/^[A-Z2-7]*$/.test(clean)) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** تولید راش تصادفی ۲۰ بایتی (base32) */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP یک‌بارمصرف مطابق RFC 4226 */
async function hotp(secretBytes: Uint8Array, counter: number, digits = 6): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes as BufferSource,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  // شمارنده به‌صورت ۸ بایت big-endian
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg as BufferSource));
  // Dynamic Truncation
  const offset = sig[sig.length - 1] & 0x0f;
  const code =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff);
  return (code % 10 ** digits).toString().padStart(digits, "0");
}

/** تولید کد TOTP برای لحظه فعلی (برای ابزار CLI) */
export async function totpNow(secretBase32: string, digits = 6): Promise<string> {
  const secret = base32Decode(secretBase32);
  if (!secret) throw new Error("INVALID_SECRET");
  return hotp(secret, Math.floor(Date.now() / 1000 / 30), digits);
}

/**
 * بررسی کد TOTP با پنجره تحمل ±1 گام (±۳۰ ثانیه)
 * @param secretBase32 راش base32
 * @param code کد ۶ رقمی واردشده توسط کاربر
 */
export async function verifyTotp(secretBase32: string, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const secret = base32Decode(secretBase32);
  if (!secret || secret.length === 0) return false;

  const step = Math.floor(Date.now() / 1000 / 30);
  // مقایسه با زمان‌های مجاز (حالا، یک گام قبل، یک گام بعد)
  for (const s of [step, step - 1, step + 1]) {
    const expected = await hotp(secret, s);
    if (expected === code) return true;
  }
  return false;
}

/** ساخت URI استاندارد otpauth برای اپ‌های Authenticator */
export function buildOtpauthUri(secretBase32: string, issuer = "WallGold Manager", account = "user"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
