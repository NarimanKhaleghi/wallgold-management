/**
 * کلاینت رسمی API وال‌گلد — اجراشده روی Cloudflare Workers (سمت سرور)
 * مستندات: https://developers.wallgold.ir/fa/docs
 *
 * نکات مهم API:
 * - پاکت پاسخ همیشه: { result, message, success, code?, errorCode? }
 * - همه اعداد به‌صورت رشته با حفظ دقت اعشار
 * - سرویس‌های خصوصی نیاز به هدر Authorization: Bearer TOKEN دارند
 * - توکن‌ها فقط در همین ماژول استفاده می‌شوند و هرگز به کلاینت نمی‌روند
 */

export const WG_BASE = "https://api.wallgold.ir/api/v1";

export type WgSide = "buy" | "sell";

/** ساختار هر بازار (از مستندات GET /markets) */
export interface WgMarket {
  symbol: string;
  baseAsset: string;
  baseAssetPrecision: string;
  quoteAsset: string;
  quotePrecision: string;
  otcFeeCoefficient: string;
  sltpFeeCoefficient: string;
  faName: string;
  enName: string;
  faBaseAsset: string;
  enBaseAsset: string;
  faQuoteAsset: string;
  enQuoteAsset: string;
  stepSize: string;
  tickSize: string;
  minQty: string;
  maxQty: string;
  minNotional: string;
  maxNotional: string;
  IsEnableBuySide: boolean;
  IsEnableSellSide: boolean;
  buyStatus: string;
  sellStatus: string;
  marketCap: {
    symbol: string;
    "24hVolume": string;
    "24hQuoteVolume": string;
    "24hHighPrice": string;
    "24hLowPrice": string;
    "24hChangePrice": string;
    lastPrice: string;
    lastBuyPrice: string;
    lastSellPrice: string;
  } | null;
}

export interface WgBalance {
  currency: "GLD_18C_750" | "SLV_925" | "TMN" | string;
  amount: string;
  locked_amount: string;
}

export interface WgPrice {
  price: string;
  priceExpiresAt: string;
  currentTime: string;
  ttl: number;
}

export interface WgOrder {
  orderId: string;
  clientId: string;
  market: string;
  amount: string;
  filledAmount: string;
  price: string;
  totalPrice: string;
  side: WgSide | string;
  status: string;
  fee: string;
  feeCurrency: string;
  otcFee: string;
  otcFeeCurrency: string;
  createdAt: string;
  updatedAt: string;
}

export interface WgResponse<T> {
  result: T;
  message: string;
  success: boolean;
  code?: number;
  errorCode?: string;
}

/** خطای ساختارافته برای مدیریت در روت‌ها */
export class WgError extends Error {
  status: number;
  errorCode?: string;

  constructor(status: number, message: string, errorCode?: string) {
    super(message);
    this.status = status;
    this.errorCode = errorCode;
  }
}

const JSON_HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json",
  // الزام gzip: برخی لبه‌های CDN وال‌گلد به‌صورت پیش‌فرض zstd می‌فرستند که
  // در runtime ورکر به‌صورت خودکار باز نمی‌شود؛ gzip همیشه پشتیبانی و خودکار decompress می‌شود.
  "Accept-Encoding": "gzip",
};

/** timeout با AbortController — سازگار با Workers */
function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return { signal: ac.signal, done: () => clearTimeout(t) };
}

/** درخواست عمومی به API وال‌گلد با مدیریت خطای ساختارافته */
async function wgFetch<T>(
  path: string,
  init: { method?: string; token?: string; body?: unknown } = {}
): Promise<WgResponse<T>> {
  const headers: Record<string, string> = { ...JSON_HEADERS };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;

  const { signal, done } = withTimeout(15000);
  let res: Response;
  try {
    res = await fetch(`${WG_BASE}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal,
      cache: "no-store",
    });
  } catch {
    throw new WgError(504, "زمان اتصال به سرور وال‌گلد به پایان رسید. اتصال اینترنت را بررسی کنید.");
  } finally {
    done();
  }

  let data: WgResponse<T>;
  try {
    data = (await res.json()) as WgResponse<T>;
  } catch {
    throw new WgError(502, `پاسخ نامعتبر از سرور وال‌گلد (HTTP ${res.status})`);
  }

  if (!data.success) {
    const code = data.code ?? res.status;
    const errMap: Record<number, string> = {
      401: "توکن نامعتبر یا منقضی است. ابتدا وارد شوید.",
      404: "سفارش مورد نظر پیدا نشد.",
      422: data.message || "خطای اعتبارسنجی درخواست.",
    };
    if (code === 422 && data.errorCode === "INVALID_PRICE") {
      throw new WgError(422, "قیمت معتبر نیست؛ قیمت جدید دریافت کنید و مجدداً تلاش نمایید.", "INVALID_PRICE");
    }
    if (code === 422 && data.errorCode === "NOT_ENOUGH_BALANCE") {
      throw new WgError(422, "موجودی شما برای این سفارش کافی نیست.", "NOT_ENOUGH_BALANCE");
    }
    throw new WgError(
      code >= 500 ? 502 : code,
      errMap[code] ?? data.message ?? `خطای ناشناخته (کد ${code})`,
      data.errorCode
    );
  }

  return data;
}

export async function wgGetMarkets(): Promise<WgMarket[]> {
  const data = await wgFetch<WgMarket[]>("/markets");
  return Array.isArray(data.result) ? data.result : [];
}

export async function wgGetBalances(token: string): Promise<WgBalance[]> {
  const data = await wgFetch<WgBalance[]>("/account/balances", { token });
  return Array.isArray(data.result) ? data.result : [];
}

export async function wgGetPrice(token: string, symbol: string, side: WgSide): Promise<WgPrice> {
  const qs = new URLSearchParams({ symbol, side });
  const data = await wgFetch<WgPrice>(`/account/price?${qs.toString()}`, { token });
  return data.result;
}

export async function wgCreateOrder(
  token: string,
  params: { symbol: string; side: WgSide; orderAmount: string; clientId?: string }
): Promise<WgOrder> {
  const data = await wgFetch<WgOrder>("/account/orders", { method: "POST", token, body: params });
  return data.result;
}

export async function wgGetOrder(token: string, orderId: string): Promise<WgOrder> {
  const data = await wgFetch<WgOrder>(`/account/orders/${encodeURIComponent(orderId)}`, { token });
  return data.result;
}

/* ------------------------- کش درون‌حافظه‌ای بازارها ------------------------- */

const MARKET_CACHE_TTL_MS = 10_000;

let marketCache: { data: WgMarket[]; at: number } | null = null;
let marketInflight: Promise<WgMarket[]> | null = null;

/** بازارها با کش ۱۰ ثانیه‌ای و جلوگیری از درخواست‌های همزمان */
export async function getMarketsCached(force = false): Promise<WgMarket[]> {
  const fresh = marketCache && Date.now() - marketCache.at < MARKET_CACHE_TTL_MS;
  if (!force && fresh && marketCache) return marketCache.data;
  if (marketInflight) return marketInflight;

  marketInflight = wgGetMarkets()
    .then((data) => {
      marketCache = { data, at: Date.now() };
      return data;
    })
    .finally(() => {
      marketInflight = null;
    });

  return marketInflight;
}

export const GOLD_SYMBOL = "GLD_18C_750TMN";
export const SILVER_SYMBOL = "SLV_925TMN";

/** تولید clientId یکتا برای سفارش (حداکثر ۱۰۰ کاراکتر) */
export function generateClientId(): string {
  const ts = Date.now().toString(36);
  const rnd = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `wg-${ts}-${rnd}`;
}
