/**
 * عملیات رمزنگاری بر پایه Web Crypto API (سازگار با Cloudflare Workers)
 * - PBKDF2-SHA256 برای هش رمز عبور
 * - AES-256-GCM برای رمزنگاری توکن‌های API وال‌گلد در حالت سکون
 * - SHA-256 برای هش توکن نشست و کدهای پشتیبان
 * - مقایسه زمان-ثابت برای جلوگیری از حمله Timing
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

/** توکن تصادفی امن (base64url) */
export function randomToken(bytes = 32): string {
  return bytesToB64url(randomBytes(bytes));
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return bytesToHex(new Uint8Array(digest));
}

/* ------------------------------- رمز عبور ------------------------------- */

export interface PasswordHash {
  iterations: number;
  saltB64: string;
  hashB64: string;
}

/** هش رمز عبور با PBKDF2-SHA256 */
export async function hashPassword(
  password: string,
  iterations: number
): Promise<string> {
  const salt = randomBytes(16);
  const bits = await pbkdf2Bits(password, salt, iterations);
  return `pbkdf2$${iterations}$${bytesToB64url(salt)}$${bytesToB64url(new Uint8Array(bits))}`;
}

async function pbkdf2Bits(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256
  );
}

/** مقایسه زمان-ثابت دو بافر با طول برابر */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** بررسی رمز عبور در برابر هش ذخیره‌شده (فرمت pbkdf2$iter$salt$hash) */
export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
    const iterations = Number(parts[1]);
    if (!Number.isFinite(iterations) || iterations < 1000) return false;
    const salt = b64urlToBytes(parts[2]);
    const expected = b64urlToBytes(parts[3]);
    const bits = await pbkdf2Bits(password, salt, iterations);
    return timingSafeEqual(expected, new Uint8Array(bits));
  } catch {
    return false;
  }
}

/* ------------------------------ AES-256-GCM ------------------------------ */

/** رمزنگاری متن با کلید ۳۲ بایتی → فرمت iv.tag.ciphertext (base64url) */
export async function aesGcmEncrypt(
  keyBytes: Uint8Array,
  plaintext: string
): Promise<string> {
  const iv = randomBytes(12);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    "AES-GCM",
    false,
    ["encrypt"]
  );
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    enc.encode(plaintext)
  );
  const tag = new Uint8Array(ct.slice(ct.byteLength - 16));
  const body = new Uint8Array(ct.slice(0, ct.byteLength - 16));
  return `${bytesToB64url(iv)}.${bytesToB64url(tag)}.${bytesToB64url(body)}`;
}

/** رمزگشایی — در صورت خرابی null */
export async function aesGcmDecrypt(
  keyBytes: Uint8Array,
  packed: string
): Promise<string | null> {
  try {
    const parts = packed.split(".");
    if (parts.length !== 3) return null;
    const iv = b64urlToBytes(parts[0]);
    const tag = b64urlToBytes(parts[1]);
    const body = b64urlToBytes(parts[2]);
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes as BufferSource,
      "AES-GCM",
      false,
      ["decrypt"]
    );
    // بازسازی ciphertext = body + tag
    const ct = new Uint8Array(body.length + tag.length);
    ct.set(body, 0);
    ct.set(tag, body.length);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ct as BufferSource
    );
    return dec.decode(pt);
  } catch {
    return null;
  }
}
