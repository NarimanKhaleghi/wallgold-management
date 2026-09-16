/**
 * فرمت‌بندی اعداد و تاریخ برای نمایش فارسی/انگلیسی
 */

const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** تبدیل ارقام به فارسی در صورت فعال بودن تنظیمات */
export function toPersianDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/** فرمت مبلغ تومانی با جداکننده هزارگان */
export function fmtTMN(value: number | string, persian = true, withUnit = true): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return persian ? "—" : "—";
  const s = Math.round(n).toLocaleString("en-US");
  const out = persian ? toPersianDigits(s) : s;
  return withUnit ? `${out} تومان` : out;
}

/** فرمت گرم با ۳ رقم اعشار */
export function fmtGram(value: number | string, persian = true, withUnit = true): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  const s = n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  const out = persian ? toPersianDigits(s) : s;
  return withUnit ? `${out} گرم` : out;
}

/** فرمت عدد عمومی */
export function fmtNum(value: number | string, decimals = 0, persian = true): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  const s = n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return persian ? toPersianDigits(s) : s;
}

/** فرمت درصد تغییر */
export function fmtPercent(value: number | string, persian = true): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  const s = `${sign}${n.toFixed(2)}%`;
  return persian ? toPersianDigits(s) : s;
}

/** فرمت تاریخ و ساعت شمسی */
export function fmtDateTime(iso: string | Date, persian = true): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  const date = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return persian ? date : d.toISOString().slice(0, 16).replace("T", " ");
}

/** فرمت فقط ساعت */
export function fmtTime(iso: string | Date, persian = true): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  const s = new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(d);
  return persian ? s : d.toTimeString().slice(0, 8);
}

/** ثانیه به mm:ss */
export function fmtCountdown(sec: number, persian = true): string {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  const out = `${mm}:${ss}`;
  return persian ? toPersianDigits(out) : out;
}

/** نام فارسی ارز */
export function currencyName(currency: string): string {
  switch (currency) {
    case "GLD_18C_750":
      return "طلا (۱۸ عیار ۷۵۰)";
    case "SLV_925":
      return "نقره (۹۲۵)";
    case "TMN":
      return "تومان";
    default:
      return currency;
  }
}

/** نام فارسی نماد بازار */
export function symbolName(symbol: string): string {
  switch (symbol) {
    case "GLD_18C_750TMN":
      return "طلای ۱۸ عیار ۷۵۰";
    case "SLV_925TMN":
      return "نقره ۹۲۵";
    default:
      return symbol;
  }
}

/** برچسب وضعیت سفارش */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  finished: "تکمیل‌شده",
  pending: "در انتظار",
  canceled: "لغو‌شده",
  rejected: "رد‌شده",
};

export function orderStatusLabel(status: string | null | undefined): string {
  if (!status) return "نامشخص";
  return ORDER_STATUS_LABELS[status] ?? status;
}
