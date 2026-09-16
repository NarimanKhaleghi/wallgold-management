/**
 * انواع محیط اجرای Cloudflare Worker + تعاریف مینیمال D1
 * هیچ وابستگی خارجی جز Hono ندارد (کاهش ریسک زنجیره تأمین).
 */

/** اینترفیس مینیمال D1 (فقط متدهای استفاده‌شده) */
export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta?: unknown;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<unknown>;
}

/** اینترفیس مینیمال اتصال Static Assets */
export interface Fetcher {
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}

export interface Env {
  /** دیتابیس D1 (اجباری) */
  DB: D1Database;
  /** اتصال فایل‌های استاتیک (توسط Cloudflare تزریق می‌شود) */
  ASSETS?: Fetcher;
  /**
   * کلید اصلی رمزنگاری AES-256-GCM توکن‌ها (base64 — ۳۲ بایت).
   * اختیاری: اگر تنظیم نشود، در اولین اجرا یک کلید تصادفی تولید و در D1 ذخیره می‌شود.
   * برای بیشترین امنیت، به‌صورت Secret تنظیم کنید (قبل از افزودن حساب‌ها).
   */
  ENCRYPTION_KEY?: string;
  /** طول عمر نشست بر حسب ثانیه (پیش‌فرض ۳۶۰۰ = یک ساعت) */
  SESSION_TTL_SECONDS?: string;
  /** تعداد تکرار PBKDF2 (پیش‌فرض ۱۰۰٬۰۰۰ — حداقل ۱۰٬۰۰۰) */
  PBKDF2_ITERATIONS?: string;
}

export type AppBindings = {
  Bindings: Env;
  /** متغیرهای درخواست (توسط میان‌افزار requireAuth تنظیم می‌شود) */
  Variables: {
    session: { tokenHash: string; expiresAt: number };
  };
};
