/**
 * WallGold Manager — Cloudflare Worker (Hono)
 *
 * لایه‌های امنیتی (به ترتیب اجرا):
 *  ۱. اطمینان از آماده بودن اسکیمای D1 (idempotent)
 *  ۲. محدودسازی حجم بدنه درخواست (۱۰۰KB)
 *  ۳. هدرهای امنیتی (CSP، X-Frame-Options، nosniff، Referrer-Policy، HSTS...)
 *  ۴. ضد CSRF: هدر X-Requested-With + بررسی Origin برای متدهای تغییردهنده
 *  ۵. ضد ربات و فلود: مسدودسازی ابزارهای اسکن/حمله + سقف نرخ درون-ایزولته
 *  ۶. مسیرهای عمومی احراز هویت (/api/auth/*) با بن IP پلکانی
 *  ۷. میان‌افزار requireAuth برای همه روت‌های داده (نشست ۱ ساعته)
 *  ۸. مدیریت خطای متمرکز بدون افشای جزئیات داخلی
 *
 * نکته: توکن‌های وال‌گلد فقط در سمت Worker استفاده می‌شوند و هرگز به
 * مرورگر ارسال نمی‌شوند؛ اتصال خروجی تنها به api.wallgold.ir است.
 */

import { Hono } from "hono";
import type { AppBindings } from "./env";
import { ensureSchema } from "./db";
import { requireAuth } from "./sessions";
import { authRoutes } from "./routes/auth";
import { accountRoutes } from "./routes/accounts";
import { marketRoutes, balanceRoutes } from "./routes/markets";
import { tradingRoutes, priceRoutes } from "./routes/trading";
import { historyRoutes, settingsRoutes, securityRoutes } from "./routes/history";
import { analyticsRoutes } from "./routes/analytics";
import { WgError } from "./wallgold";
import { clientIp, inMemoryRateLimit, isBadBot, recordSecurityEvent } from "./ratelimit";

const app = new Hono<AppBindings>();

/* ------------------------ ۱) آماده‌سازی دیتابیس ------------------------ */

app.use("*", async (c, next) => {
  try {
    await ensureSchema(c.env.DB);
  } catch (e) {
    console.error("[db-init-failed]", e instanceof Error ? e.message : e);
    return c.json(
      {
        success: false,
        message: "اتصال به دیتابیس D1 برقرار نشد. مطمئن شوید binding درست تنظیم شده است.",
        code: 503,
      },
      503
    );
  }
  await next();
});

/* ------------------------ ۲) محدودیت حجم بدنه ------------------------ */

const MAX_BODY_BYTES = 100 * 1024;

app.use("/api/*", async (c, next) => {
  const method = c.req.method;
  if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
    const len = Number(c.req.header("content-length") ?? 0);
    if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
      return c.json({ success: false, message: "حجم درخواست بیش از حد مجاز است." }, 413);
    }
  }
  await next();
});

/* ------------------------ ۳) هدرهای امنیتی ------------------------ */

app.use("*", async (c, next) => {
  await next();

  const isApi = new URL(c.req.url).pathname.startsWith("/api/");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  c.header("Cross-Origin-Opener-Policy", "same-origin");
  c.header(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ")
  );
  if (c.req.url.startsWith("https://")) {
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  if (isApi) {
    c.header("Cache-Control", "no-store, no-cache, must-revalidate");
    c.header("Pragma", "no-cache");
  }
});

/* ------------------------ ۴) ضد CSRF ------------------------ */

app.use("/api/*", async (c, next) => {
  const method = c.req.method;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const ip = clientIp(c.req.header("cf-connecting-ip"));
    // الف) هدر سفارشی — از درخواست متقاطع قابل ارسال نیست بدون مجوز CORS
    if (c.req.header("x-requested-with") !== "fetch") {
      recordSecurityEvent(c.env.DB, {
        type: "csrf_blocked",
        ip,
        userAgent: c.req.header("user-agent"),
        detail: `هدر امنیتی موجود نبود (${new URL(c.req.url).pathname})`,
      }).catch(() => {});
      return c.json({ success: false, message: "درخواست نامعتبر (CSRF)." }, 403);
    }
    // ب) بررسی Origin در صورت ارسال
    const origin = c.req.header("origin");
    if (origin) {
      try {
        const originHost = new URL(origin).host;
        const requestHost = new URL(c.req.url).host;
        if (originHost !== requestHost) {
          recordSecurityEvent(c.env.DB, {
            type: "csrf_blocked",
            ip,
            userAgent: c.req.header("user-agent"),
            detail: `Origin متقاطع: ${originHost}`,
          }).catch(() => {});
          return c.json({ success: false, message: "درخواست متقاطع مجاز نیست." }, 403);
        }
      } catch {
        return c.json({ success: false, message: "درخواست نامعتبر." }, 403);
      }
    }
  }
  await next();
});

/* ------------------ ۵) ضد ربات + سقف نرخ درون-ایزولته ------------------ */

app.use("/api/*", async (c, next) => {
  const ip = clientIp(c.req.header("cf-connecting-ip"));
  const ua = c.req.header("user-agent");
  const path = new URL(c.req.url).pathname;

  // الف) مسدودسازی ابزارهای حمله/اسکن شناخته‌شده روی مسیرهای احراز هویت
  if (path.startsWith("/api/auth") && isBadBot(ua)) {
    recordSecurityEvent(c.env.DB, {
      type: "bot_blocked",
      ip,
      userAgent: ua,
      detail: `ابزار حمله روی ${path}`,
    }).catch(() => {});
    return c.json({ success: false, message: "دسترسی مسدود شد." }, 403);
  }

  // ب) سقف نرخ: مسیرهای احراز هویت ۳۰ درخواست/دقیقه، سایر API ها ۳۰۰ درخواست/دقیقه
  const isAuth = path.startsWith("/api/auth");
  const ok = isAuth
    ? inMemoryRateLimit(`mem:auth:${ip}`, 30, 60_000)
    : inMemoryRateLimit(`mem:api:${ip}`, 300, 60_000);
  if (!ok) {
    if (isAuth) {
      recordSecurityEvent(c.env.DB, {
        type: "rate_limited",
        ip,
        userAgent: ua,
        detail: `سقف نرخ مسیر احراز هویت (${path})`,
      }).catch(() => {});
    }
    c.header("Retry-After", "60");
    return c.json(
      { success: false, message: "تعداد درخواست‌ها بیش از حد مجاز است. کمی صبر کنید." },
      429
    );
  }

  await next();
});

/* ------------------------ ۶) روت‌های عمومی ------------------------ */

app.get("/api/health", (c) =>
  c.json({ success: true, ok: true, time: new Date().toISOString() })
);

app.route("/api/auth", authRoutes);

/* ------------------------ ۷) روت‌های نیازمند نشست ------------------------ */

app.use("/api/*", requireAuth);

app.route("/api/markets", marketRoutes);
app.route("/api/balances", balanceRoutes);
app.route("/api/accounts", accountRoutes);
app.route("/api/price", priceRoutes);
app.route("/api/orders", tradingRoutes);
app.route("/api/history", historyRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/security", securityRoutes);
app.route("/api/analytics", analyticsRoutes);

/* ------------------------ ۸) خطاهای متمرکز ------------------------ */

app.notFound((c) => {
  if (new URL(c.req.url).pathname.startsWith("/api/")) {
    return c.json({ success: false, message: "مسیر مورد نظر پیدا نشد." }, 404);
  }
  // مسیرهای غیر API توسط Static Assets (SPA fallback) مدیریت می‌شوند
  return c.json({ success: false, message: "یافت نشد." }, 404);
});

app.onError((err, c) => {
  if (err instanceof WgError) {
    return c.json(
      { success: false, message: err.message, ...(err.errorCode ? { errorCode: err.errorCode } : {}) },
      err.status as 400
    );
  }
  // ثبت خطا در سمت سرور بدون داده حساس (توکن/رمز هرگز لاگ نمی‌شوند)
  console.error("[worker-error]", err instanceof Error ? `${err.name}: ${err.message}` : String(err));
  return c.json({ success: false, message: "خطای داخلی سرور. لطفاً مجدداً تلاش کنید." }, 500);
});

export default app;

