#!/usr/bin/env node
/**
 * ابزار تولید کد TOTP از راش base32 (برای تست و بازیابی اضطراری)
 *
 * استفاده:
 *   node scripts/totp.js JBSWY3DPEHPK3PXP
 *   npm run totp -- JBSWY3DPEHPK3PXP
 *
 * همان الگوریتم RFC 6238 که اپ‌های Authenticator استفاده می‌کنند
 * (۶ رقم، SHA-1، بازه ۳۰ ثانیه).
 */

import crypto from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input) {
  const clean = input.replace(/[\s=-]/g, "").toUpperCase();
  if (!/^[A-Z2-7]*$/.test(clean)) {
    console.error("خطا: راش base32 نامعتبر است");
    process.exit(1);
  }
  let bits = 0;
  let value = 0;
  const out = [];
  for (const c of clean) {
    value = (value << 5) | ALPHABET.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret, counter) {
  const msg = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const sig = crypto.createHmac("sha1", secret).update(msg).digest();
  const offset = sig[sig.length - 1] & 0x0f;
  const code =
    ((sig[offset] & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) << 8) |
    (sig[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, "0");
}

const secretArg = process.argv[2];
if (!secretArg) {
  console.error("استفاده: node scripts/totp.js <SECRET_BASE32>");
  process.exit(1);
}

const secret = base32Decode(secretArg);
const step = Math.floor(Date.now() / 1000 / 30);
const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);

console.log(`کد فعلی:    ${hotp(secret, step)}`);
console.log(`کد قبلی:    ${hotp(secret, step - 1)}  (اگر ساعت دستگاه عقب است)`);
console.log(`کد بعدی:    ${hotp(secret, step + 1)}  (اگر ساعت دستگاه جلو است)`);
console.log(`\nاعتبار کد فعلی: ${remaining} ثانیه دیگر`);
