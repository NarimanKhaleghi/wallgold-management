/**
 * روت‌های احراز هویت — قلب امنیتی اپلیکیشن
 *
 * جریان‌ها:
 * - GET  /api/auth/status   وضعیت عمومی (راه‌اندازی‌شده؟ 2FA فعال؟) — عمومی
 * - POST /api/auth/setup    راه‌اندازی اولیه: ساخت رمز عبور (فقط یک‌بار، بدون نیاز به رمز قبلی)
 * - POST /api/auth/login    ورود با رمز + کد 2FA (در صورت فعال بودن)
 * - POST /api/auth/logout   خروج
 * - GET  /api/auth/session  اطلاعات نشست فعلی + زمان انقضا
 * - POST /api/auth/password تغییر رمز عبور (نیاز به رمز فعلی + کد 2FA)
 * - GET  /api/auth/totp/enroll    شروع فعال‌سازی 2FA (راش جدید + otpauth)
 * - POST /api/auth/totp/enable    تأیید کد و فعال‌سازی 2FA + کدهای پشتیبان
 * - POST /api/auth/totp/disable   غیرفعال‌سازی 2FA (رمز + کد)
 * - POST /api/auth/totp/backup    تولید مجدد کدهای پشتیبان (رمز + کد)
 * - POST /api/auth/logout-all     خروج از همه دستگاه‌ها
 */

import { Hono, type Context } from "hono";
import type { AppBindings } from "../env";
import { getSetting, setSetting, deleteSetting, nowMs } from "../db";
import { getMasterKey } from "../db";
import { hashPassword, verifyPassword, aesGcmEncrypt, sha256Hex } from "../crypto";
import { generateTotpSecret, verifyTotp, buildOtpauthUri } from "../totp";
import { readTotpSecret, verifySecondFactor } from "./auth-helpers";
import {
  createSession,
  getSession,
  revokeSession,
  revokeOtherSessions,
  revokeAllSessions,
  sessionTtlMs,
  countActiveSessions,
} from "../sessions";
import { checkRateLimit, recordFailure, clearFailures, clientIp } from "../ratelimit";

export const authRoutes = new Hono<AppBindings>();

const KEY_PASSWORD_HASH = "auth.password_hash";
const KEY_TOTP_SECRET = "auth.totp_secret"; // رمزنگاری‌شده با کلید اصلی
const KEY_TOTP_PENDING = "auth.totp_pending"; // راش در انتظار فعال‌سازی
const KEY_TOTP_ENABLED = "auth.totp_enabled";

/* ------------------------------ وضعیت احراز هویت ------------------------------ */

export interface AuthState {
  initialized: boolean;
  has2fa: boolean;
}

export async function getAuthState(db: AppBindings["Bindings"]["DB"]): Promise<AuthState> {
  const [hash, enabled] = await Promise.all([
    getSetting(db, KEY_PASSWORD_HASH),
    getSetting(db, KEY_TOTP_ENABLED),
  ]);
  return { initialized: !!hash, has2fa: enabled === "1" };
}

/** تعداد تکرار PBKDF2 (پیش‌فرض ۱۰۰٬۰۰۰ — قابل تنظیم با متغیر محیطی) */
function pbkdf2Iterations(env: AppBindings["Bindings"]): number {
  const n = Number(env.PBKDF2_ITERATIONS);
  return Number.isFinite(n) && n >= 10_000 ? Math.floor(n) : 100_000;
}

/* --------------------------------- بدنه کمکی --------------------------------- */

async function readJson(c: Context<AppBindings>): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

/** تولید ۸ کد پشتیبان یک‌بارمصرف — فقط هش آنها ذخیره می‌شود */
async function generateBackupCodes(db: AppBindings["Bindings"]["DB"]): Promise<string[]> {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"; // بدون کاراکترهای مشکل‌دار
  const codes: string[] = [];
  const stmts = [];
  await db.prepare("DELETE FROM backup_codes").run();
  // مقادیر تصادفی با منبع رمزنگاری امن (crypto.getRandomValues)
  const randomValues = new Uint32Array(8 * 10);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < 8; i++) {
    let code = "";
    for (let j = 0; j < 10; j++) {
      code += alphabet[randomValues[i * 10 + j] % alphabet.length];
    }
    const formatted = `${code.slice(0, 5)}-${code.slice(5)}`;
    codes.push(formatted);
    stmts.push(
      db.prepare("INSERT INTO backup_codes (code_hash, used, created_at) VALUES (?, 0, ?)").bind(
        await sha256Hex(code),
        nowMs()
      )
    );
  }
  await db.batch(stmts);
  return codes;
}

/* -------------------------------- روت‌ها -------------------------------- */

/** GET /api/auth/status — عمومی: صفحه ورود باید بداند چه فیلدهایی نمایش دهد */
authRoutes.get("/status", async (c) => {
  const state = await getAuthState(c.env.DB);
  return c.json({ success: true, ...state, sessionTtlSec: Math.floor(sessionTtlMs(c.env) / 1000) });
});

/** POST /api/auth/setup — راه‌اندازی اولیه (ساخت رمز)؛ فقط زمانی که هنوز رمزی وجود ندارد */
authRoutes.post("/setup", async (c) => {
  const ip = clientIp(c.req.header("cf-connecting-ip"));
  const rl = await checkRateLimit(c.env.DB, `setup:${ip}`, 5, 10 * 60_000, 15 * 60_000);
  if (!rl.allowed) {
    return c.json(
      { success: false, message: `تلاش‌های بیش از حد. ${Math.ceil(rl.retryAfterSec / 60)} دقیقه دیگر مجدداً تلاش کنید.` },
      429
    );
  }

  const state = await getAuthState(c.env.DB);
  if (state.initialized) {
    return c.json({ success: false, message: "اپلیکیشن قبلاً راه‌اندازی شده است. وارد شوید." }, 403);
  }

  const body = await readJson(c);
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8) {
    return c.json({ success: false, message: "رمز عبور باید حداقل ۸ کاراکتر باشد." }, 400);
  }
  if (password.length > 128) {
    return c.json({ success: false, message: "رمز عبور حداکثر ۱۲۸ کاراکتر می‌تواند باشد." }, 400);
  }

  const hash = await hashPassword(password, pbkdf2Iterations(c.env));
  await setSetting(c.env.DB, KEY_PASSWORD_HASH, hash);
  await clearFailures(c.env.DB, `setup:${ip}`);

  const { expiresAt } = await createSession(c, { has2fa: false });
  return c.json({ success: true, message: "رمز عبور با موفقیت ایجاد شد.", expiresAt, nextStep: "totp" });
});

/** POST /api/auth/login — ورود با رمز عبور (+ کد 2FA در صورت فعال بودن) */
authRoutes.post("/login", async (c) => {
  const ip = clientIp(c.req.header("cf-connecting-ip"));
  const db = c.env.DB;

  const rl = await checkRateLimit(db, `login:${ip}`, 5, 10 * 60_000, 15 * 60_000);
  if (!rl.allowed) {
    return c.json(
      { success: false, message: `تلاش‌های ورود بیش از حد مجاز. ${Math.ceil(rl.retryAfterSec / 60)} دقیقه دیگر تلاش کنید.` },
      429
    );
  }

  const state = await getAuthState(db);
  if (!state.initialized) {
    return c.json({ success: false, message: "اپلیکیشن هنوز راه‌اندازی نشده است." }, 400);
  }

  const body = await readJson(c);
  const password = typeof body.password === "string" ? body.password : "";
  const totp = typeof body.totp === "string" ? body.totp.trim() : "";

  if (!password) {
    return c.json({ success: false, message: "رمز عبور را وارد کنید." }, 400);
  }

  // مرحله ۱: رمز عبور
  const stored = await getSetting(db, KEY_PASSWORD_HASH);
  if (!stored || !(await verifyPassword(password, stored))) {
    await recordFailure(db, `login:${ip}`, 10 * 60_000);
    return c.json({ success: false, message: "رمز عبور نادرست است." }, 401);
  }

  // مرحله ۲: ورود دومرحله‌ای
  if (state.has2fa) {
    if (!totp) {
      // رمز درست است اما کد 2FA هنوز وارد نشده — بدون ایجاد نشست
      return c.json({ success: true, needs2fa: true });
    }

    const totpRl = await checkRateLimit(db, `totp:${ip}`, 10, 5 * 60_000, 15 * 60_000);
    if (!totpRl.allowed) {
      return c.json(
        { success: false, message: `تلاش‌های کد تأیید بیش از حد. ${Math.ceil(totpRl.retryAfterSec / 60)} دقیقه دیگر تلاش کنید.` },
        429
      );
    }

    if (!(await verifySecondFactor(db, c.env, totp))) {
      await recordFailure(db, `totp:${ip}`, 5 * 60_000);
      return c.json({ success: false, message: "کد تأیید دومرحله‌ای نامعتبر است." }, 401);
    }
  }

  // موفق — پاک‌سازی شمارنده‌ها و ایجاد نشست
  await Promise.all([clearFailures(db, `login:${ip}`), clearFailures(db, `totp:${ip}`)]);
  const { expiresAt } = await createSession(c, { has2fa: state.has2fa });
  return c.json({ success: true, expiresAt, has2fa: state.has2fa });
});

/** POST /api/auth/logout — خروج و ابطال نشست فعلی */
authRoutes.post("/logout", async (c) => {
  await revokeSession(c);
  return c.json({ success: true });
});

/** GET /api/auth/session — وضعیت نشست (برای شمارش معکوس انقضا در کلاینت) */
authRoutes.get("/session", async (c) => {
  const session = await getSession(c);
  const state = await getAuthState(c.env.DB);
  if (!session) {
    return c.json(
      { success: false, authenticated: false, message: "نشست معتبر نیست." },
      401
    );
  }
  const activeSessions = await countActiveSessions(c);
  return c.json({
    success: true,
    authenticated: true,
    expiresAt: session.expiresAt,
    serverNow: nowMs(),
    has2fa: state.has2fa,
    activeSessions,
  });
});

/** POST /api/auth/password — تغییر رمز عبور (رمز فعلی + کد 2FA در صورت فعال بودن) */
authRoutes.post("/password", async (c) => {
  const session = await getSession(c);
  if (!session) {
    return c.json({ success: false, message: "نشست معتبر نیست." }, 401);
  }

  const db = c.env.DB;
  const body = await readJson(c);
  const current = typeof body.current === "string" ? body.current : "";
  const newPassword = typeof body.new === "string" ? body.new : "";
  const totp = typeof body.totp === "string" ? body.totp.trim() : "";

  const stored = await getSetting(db, KEY_PASSWORD_HASH);
  if (!stored || !(await verifyPassword(current, stored))) {
    return c.json({ success: false, message: "رمز فعلی نادرست است." }, 401);
  }

  const state = await getAuthState(db);
  if (state.has2fa) {
    if (!totp || !(await verifySecondFactor(db, c.env, totp))) {
      return c.json({ success: false, message: "کد تأیید دومرحله‌ای لازم است یا نامعتبر است." }, 401);
    }
  }

  if (newPassword.length < 8) {
    return c.json({ success: false, message: "رمز جدید باید حداقل ۸ کاراکتر باشد." }, 400);
  }
  if (newPassword.length > 128) {
    return c.json({ success: false, message: "رمز جدید حداکثر ۱۲۸ کاراکتر می‌تواند باشد." }, 400);
  }

  const hash = await hashPassword(newPassword, pbkdf2Iterations(c.env));
  await setSetting(db, KEY_PASSWORD_HASH, hash);

  // ابطال همه نشست‌های دیگر (این دستگاه باقی می‌ماند)
  await revokeOtherSessions(c);
  return c.json({ success: true, message: "رمز عبور تغییر کرد و سایر نشست‌ها ابطال شدند." });
});

/** POST /api/auth/logout-all — خروج از همه دستگاه‌ها */
authRoutes.post("/logout-all", async (c) => {
  const session = await getSession(c);
  if (!session) {
    return c.json({ success: false, message: "نشست معتبر نیست." }, 401);
  }
  await revokeAllSessions(c);
  return c.json({ success: true, message: "از همه دستگاه‌ها خارج شدید." });
});

/* ------------------------------ ورود دومرحله‌ای ------------------------------ */

/** GET /api/auth/totp/enroll — تولید راش جدید + URI (کلاینت خودش QR می‌سازد) */
authRoutes.get("/totp/enroll", async (c) => {
  const session = await getSession(c);
  if (!session) {
    return c.json({ success: false, message: "نشست معتبر نیست." }, 401);
  }

  const db = c.env.DB;
  const state = await getAuthState(db);
  if (state.has2fa) {
    return c.json({ success: false, message: "ورود دومرحله‌ای از قبل فعال است. ابتدا آن را غیرفعال کنید." }, 409);
  }

  const secret = generateTotpSecret();
  const masterKey = await getMasterKey(db, c.env.ENCRYPTION_KEY);
  const encrypted = await aesGcmEncrypt(masterKey, secret);
  await setSetting(db, KEY_TOTP_PENDING, encrypted);

  return c.json({
    success: true,
    secret,
    otpauthUri: buildOtpauthUri(secret),
  });
});

/** POST /api/auth/totp/enable — تأیید کد و فعال‌سازی + بازگرداندن کدهای پشتیبان (فقط یک‌بار) */
authRoutes.post("/totp/enable", async (c) => {
  const session = await getSession(c);
  if (!session) {
    return c.json({ success: false, message: "نشست معتبر نیست." }, 401);
  }

  const db = c.env.DB;
  const body = await readJson(c);
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return c.json({ success: false, message: "کد ۶ رقمی اپ Authenticator را وارد کنید." }, 400);
  }

  const pending = await readTotpSecret(db, c.env, KEY_TOTP_PENDING);
  if (!pending) {
    return c.json({ success: false, message: "ابتدا فرآیند فعال‌سازی را شروع کنید." }, 400);
  }

  if (!(await verifyTotp(pending, code))) {
    return c.json({ success: false, message: "کد نامعتبر است. دوباره تلاش کنید." }, 401);
  }

  // انتقال راش از حالت pending به فعال
  const masterKey = await getMasterKey(db, c.env.ENCRYPTION_KEY);
  const encrypted = await aesGcmEncrypt(masterKey, pending);
  await setSetting(db, KEY_TOTP_SECRET, encrypted);
  await setSetting(db, KEY_TOTP_ENABLED, "1");
  await deleteSetting(db, KEY_TOTP_PENDING);

  const backupCodes = await generateBackupCodes(db);
  return c.json({ success: true, message: "ورود دومرحله‌ای فعال شد.", backupCodes });
});

/** POST /api/auth/totp/disable — غیرفعال‌سازی 2FA (رمز + کد) */
authRoutes.post("/totp/disable", async (c) => {
  const session = await getSession(c);
  if (!session) {
    return c.json({ success: false, message: "نشست معتبر نیست." }, 401);
  }

  const db = c.env.DB;
  const body = await readJson(c);
  const password = typeof body.password === "string" ? body.password : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";

  const stored = await getSetting(db, KEY_PASSWORD_HASH);
  if (!stored || !(await verifyPassword(password, stored))) {
    return c.json({ success: false, message: "رمز عبور نادرست است." }, 401);
  }

  const state = await getAuthState(db);
  if (state.has2fa && !(await verifySecondFactor(db, c.env, code))) {
    return c.json({ success: false, message: "کد تأیید نامعتبر است." }, 401);
  }

  await Promise.all([
    deleteSetting(db, KEY_TOTP_SECRET),
    deleteSetting(db, KEY_TOTP_PENDING),
    deleteSetting(db, KEY_TOTP_ENABLED),
    db.prepare("DELETE FROM backup_codes").run(),
  ]);
  return c.json({ success: true, message: "ورود دومرحله‌ای غیرفعال شد." });
});

/** POST /api/auth/totp/backup — تولید مجدد کدهای پشتیبان (رمز + کد) */
authRoutes.post("/totp/backup", async (c) => {
  const session = await getSession(c);
  if (!session) {
    return c.json({ success: false, message: "نشست معتبر نیست." }, 401);
  }

  const db = c.env.DB;
  const state = await getAuthState(db);
  if (!state.has2fa) {
    return c.json({ success: false, message: "ورود دومرحله‌ای فعال نیست." }, 400);
  }

  const body = await readJson(c);
  const password = typeof body.password === "string" ? body.password : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";

  const stored = await getSetting(db, KEY_PASSWORD_HASH);
  if (!stored || !(await verifyPassword(password, stored))) {
    return c.json({ success: false, message: "رمز عبور نادرست است." }, 401);
  }
  if (!(await verifySecondFactor(db, c.env, code))) {
    return c.json({ success: false, message: "کد تأیید نامعتبر است." }, 401);
  }

  const backupCodes = await generateBackupCodes(db);
  return c.json({ success: true, backupCodes });
});
