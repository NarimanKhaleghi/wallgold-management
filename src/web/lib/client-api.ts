/**
 * کلاینت API داخلی (سمت مرورگر)
 *
 * - همه درخواست‌ها نسبی هستند؛ توکن‌های وال‌گلد هرگز به کلاینت نمی‌رسند
 * - هدر X-Requested-With برای محافظت ضد CSRF در همه درخواست‌ها ارسال می‌شود
 * - خطای 401 از روت‌های غیر auth → رویداد سراسری «wg:unauthorized» →
 *   اپلیکیشن فوراً از حالت لاگین‌شده خارج و صفحه ورود نمایش داده می‌شود
 *   (تمام polling‌ها هم متوقف می‌شوند چون کامپوننت‌ها unmount می‌شوند)
 */

export interface ApiFail {
  success: false;
  message: string;
  errorCode?: string;
  [k: string]: unknown;
}

export class ApiError extends Error {
  status: number;
  errorCode?: string;
  constructor(status: number, message: string, errorCode?: string) {
    super(message);
    this.status = status;
    this.errorCode = errorCode;
  }
}

/** رویداد خروج اجباری (نشست منقضی/ابطال‌شده) */
export const UNAUTHORIZED_EVENT = "wg:unauthorized";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", "X-Requested-With": "fetch", ...(init?.headers ?? {}) },
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "ارتباط با سرور برقرار نشد. اتصال اینترنت را بررسی کنید.");
  }

  // 401 از روت‌های محافظت‌شده → خروج سراسری (به‌جز خود فرآیند ورود)
  if (res.status === 401 && !url.startsWith("/api/auth/")) {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT, { detail: { url } }));
    throw new ApiError(401, "نشست شما منقضی شده است. دوباره وارد شوید.");
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new ApiError(res.status, `پاسخ نامعتبر از سرور (HTTP ${res.status})`);
  }

  const obj = data as Record<string, unknown>;
  if (obj && obj.success === false) {
    throw new ApiError(res.status, String(obj.message ?? "خطای نامشخص"), obj.errorCode as string | undefined);
  }
  return data as T;
}

/* ---------------------------------- انواع مشترک ---------------------------------- */

export interface PublicAccount {
  id: string;
  name: string;
  visible: boolean;
  lastCheckOk: boolean | null;
  lastCheckMsg: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
}

export interface MarketCap {
  symbol: string;
  "24hVolume": string;
  "24hQuoteVolume": string;
  "24hHighPrice": string;
  "24hLowPrice": string;
  "24hChangePrice": string;
  lastPrice: string;
  lastBuyPrice: string;
  lastSellPrice: string;
}

export interface Market {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  otcFeeCoefficient: string;
  faName: string;
  enName: string;
  faBaseAsset: string;
  enBaseAsset: string;
  minQty: string;
  maxQty: string;
  minNotional: string;
  maxNotional: string;
  buyStatus: string;
  sellStatus: string;
  marketCap: MarketCap | null;
}

export interface Balance {
  currency: string;
  amount: string;
  locked_amount: string;
}

export interface AccountBalances {
  accountId: string;
  name: string;
  ok: boolean;
  error?: string;
  balances: Balance[];
  fetchedAt: string;
}

export interface WgPriceInfo {
  price: string;
  priceExpiresAt: string;
  currentTime: string;
  ttl: number;
}

export interface WgOrderInfo {
  orderId: string;
  clientId: string;
  market: string;
  amount: string;
  filledAmount: string;
  price: string;
  totalPrice: string;
  side: "buy" | "sell" | string;
  status: string;
  fee: string;
  feeCurrency: string;
  otcFee: string;
  otcFeeCurrency: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrackedOrder {
  id: string;
  accountId: string;
  accountName: string;
  orderId: string;
  clientId: string | null;
  lastStatus: string | null;
  detail: WgOrderInfo | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettingsInfo {
  autoLogoutMinutes: number;
  marketsRefreshSeconds: number;
  balancesRefreshSeconds: number;
  persianDigits: boolean;
  highValueWarningTMN: number;
  defaultTheme: "dark" | "light";
}

/* --------------------------------- احراز هویت --------------------------------- */

export interface AuthStatus {
  initialized: boolean;
  has2fa: boolean;
  sessionTtlSec: number;
}

export interface SessionInfo {
  authenticated: boolean;
  expiresAt: number;
  serverNow: number;
  has2fa: boolean;
  activeSessions: number;
}

export const api = {
  auth: {
    /** وضعیت عمومی: آیا رمز تعریف شده؟ 2FA فعال است؟ */
    status: () => request<AuthStatus>("/api/auth/status"),

    /** راه‌اندازی اولیه — ساخت رمز عبور (بدون نیاز به رمز قبلی) */
    setup: (password: string) =>
      request<{ expiresAt: number; nextStep: string }>("/api/auth/setup", {
        method: "POST",
        body: JSON.stringify({ password }),
      }),

    /** ورود — اگر 2FA فعال باشد و کد ارسال نشده باشد، needs2fa=true برمی‌گردد */
    login: (password: string, totp?: string) =>
      request<{ ok?: boolean; needs2fa?: boolean; expiresAt?: number; has2fa?: boolean }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password, totp }),
      }),

    logout: () => request<{ success: boolean }>("/api/auth/logout", { method: "POST" }),

    logoutAll: () => request<{ success: boolean; message: string }>("/api/auth/logout-all", { method: "POST" }),

    session: () => request<SessionInfo>("/api/auth/session"),

    /** تغییر رمز عبور (رمز فعلی + کد 2FA در صورت فعال بودن) */
    changePassword: (current: string, newPassword: string, totp?: string) =>
      request<{ success: boolean; message: string }>("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({ current, new: newPassword, totp }),
      }),

    /** شروع فعال‌سازی 2FA — راش و URI برای ساخت QR */
    totpEnroll: () =>
      request<{ secret: string; otpauthUri: string }>("/api/auth/totp/enroll"),

    /** تأیید کد و فعال‌سازی 2FA — کدهای پشتیبان فقط یک‌بار نمایش داده می‌شوند */
    totpEnable: (code: string) =>
      request<{ backupCodes: string[]; message: string }>("/api/auth/totp/enable", {
        method: "POST",
        body: JSON.stringify({ code }),
      }),

    totpDisable: (password: string, code: string) =>
      request<{ success: boolean; message: string }>("/api/auth/totp/disable", {
        method: "POST",
        body: JSON.stringify({ password, code }),
      }),

    totpBackupRegenerate: (password: string, code: string) =>
      request<{ backupCodes: string[] }>("/api/auth/totp/backup", {
        method: "POST",
        body: JSON.stringify({ password, code }),
      }),
  },

  /* -------------------------------- بازارها -------------------------------- */
  getMarkets: (force = false) =>
    request<{ markets: Market[]; serverTime: string }>(`/api/markets${force ? "?force=1" : ""}`),

  /* -------------------------------- حساب‌ها -------------------------------- */
  getAccounts: () => request<{ accounts: PublicAccount[] }>("/api/accounts"),
  addAccount: (name: string, token: string) =>
    request<{ account: PublicAccount }>("/api/accounts", {
      method: "POST",
      body: JSON.stringify({ name, token }),
    }),
  updateAccount: (id: string, data: { name?: string; visible?: boolean }) =>
    request<{ account: PublicAccount }>(`/api/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteAccount: (id: string) => request<{ deleted: boolean }>(`/api/accounts/${id}`, { method: "DELETE" }),
  testAccount: (id: string) =>
    request<{ account: PublicAccount; message: string }>(`/api/accounts/${id}/test`, { method: "POST" }),

  /* -------------------------------- موجودی -------------------------------- */
  getBalances: (accountId?: string) =>
    request<{ results: AccountBalances[] }>(`/api/balances${accountId ? `?accountId=${accountId}` : ""}`),

  /* ------------------------------ قیمت و سفارش ------------------------------ */
  getPrice: (accountId: string, symbol: string, side: "buy" | "sell") =>
    request<{ price: WgPriceInfo; serverNow: string }>("/api/price", {
      method: "POST",
      body: JSON.stringify({ accountId, symbol, side }),
    }),

  createOrder: (params: { accountId: string; symbol: string; side: "buy" | "sell"; orderAmount: string }) =>
    request<{ order: WgOrderInfo }>("/api/orders", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  getOrder: (accountId: string, orderId: string) =>
    request<{ order: WgOrderInfo }>(`/api/orders/${encodeURIComponent(orderId)}?accountId=${accountId}`),

  trackOrder: (accountId: string, orderId: string) =>
    request<{ tracked: boolean }>(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: "POST",
      body: JSON.stringify({ accountId }),
    }),

  /* -------------------------------- تاریخچه -------------------------------- */
  getHistory: (refresh = false) => request<{ orders: TrackedOrder[] }>(`/api/history${refresh ? "?refresh=1" : ""}`),
  deleteHistory: (id: string) => request<{ deleted: boolean }>(`/api/history?id=${id}`, { method: "DELETE" }),

  /* -------------------------------- تنظیمات -------------------------------- */
  getSettings: () => request<{ settings: AppSettingsInfo }>("/api/settings"),
  saveSettings: (data: Partial<AppSettingsInfo>) =>
    request<{ settings: AppSettingsInfo; changed: number }>("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  /* -------------------------------- پاک‌سازی -------------------------------- */
  wipeAll: (password: string, code?: string) =>
    request<{ wiped: boolean; message: string }>("/api/security/wipe", {
      method: "POST",
      body: JSON.stringify({ password, code }),
    }),
};
