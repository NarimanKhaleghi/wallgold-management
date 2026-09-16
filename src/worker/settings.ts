/**
 * تنظیمات عمومی اپلیکیشن — فقط کلیدهای مجاز به کلاینت برمی‌گردند.
 * کلیدهای امنیتی (هش رمز، راش TOTP و...) هرگز از این ماژول خارج نمی‌شوند.
 */

import type { D1Database } from "./env";
import { getSetting } from "./db";

export interface AppSettings {
  autoLogoutMinutes: number; // خروج خودکار پس از بی‌فعالیتی (۰ = غیرفعال)
  marketsRefreshSeconds: number; // ۰ = غیرفعال
  balancesRefreshSeconds: number; // ۰ = غیرفعال
  persianDigits: boolean;
  highValueWarningTMN: number;
  defaultTheme: "dark" | "light";
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoLogoutMinutes: 15,
  marketsRefreshSeconds: 30,
  balancesRefreshSeconds: 60,
  persianDigits: true,
  highValueWarningTMN: 50_000_000,
  defaultTheme: "dark",
};

export async function getSettings(db: D1Database): Promise<AppSettings> {
  const rows = await db.prepare("SELECT key, value FROM app_settings").all<{ key: string; value: string }>();
  const map = new Map(rows.results.map((r) => [r.key, r.value]));
  const num = (k: keyof AppSettings & string, d: number) => {
    const v = map.get(k);
    const n = v === undefined ? NaN : Number(v);
    return Number.isFinite(n) ? n : d;
  };
  return {
    autoLogoutMinutes: Math.max(0, num("autoLogoutMinutes", DEFAULT_SETTINGS.autoLogoutMinutes)),
    marketsRefreshSeconds: Math.max(0, num("marketsRefreshSeconds", DEFAULT_SETTINGS.marketsRefreshSeconds)),
    balancesRefreshSeconds: Math.max(0, num("balancesRefreshSeconds", DEFAULT_SETTINGS.balancesRefreshSeconds)),
    persianDigits: map.get("persianDigits") !== "false",
    highValueWarningTMN: Math.max(0, num("highValueWarningTMN", DEFAULT_SETTINGS.highValueWarningTMN)),
    defaultTheme: map.get("defaultTheme") === "light" ? "light" : "dark",
  };
}

/** اعتبارسنجی و ذخیره کلیدهای مجاز تنظیمات */
export async function saveSettings(
  db: D1Database,
  input: Record<string, unknown>
): Promise<number> {
  const { setSetting } = await import("./db");
  const numeric = (v: unknown, min: number, max: number): string | null => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) return null;
    return String(Math.floor(n));
  };

  let changed = 0;
  const pairs: Array<[string, string | null]> = [
    ["autoLogoutMinutes", numeric(input.autoLogoutMinutes, 0, 1440)],
    ["marketsRefreshSeconds", numeric(input.marketsRefreshSeconds, 0, 3600)],
    ["balancesRefreshSeconds", numeric(input.balancesRefreshSeconds, 0, 3600)],
    ["highValueWarningTMN", numeric(input.highValueWarningTMN, 0, 1e15)],
    ["persianDigits", typeof input.persianDigits === "boolean" ? String(input.persianDigits) : null],
    [
      "defaultTheme",
      input.defaultTheme === "light" ? "light" : input.defaultTheme === "dark" ? "dark" : null,
    ],
  ];

  for (const [k, v] of pairs) {
    if (v !== null) {
      await setSetting(db, k, v);
      changed++;
    }
  }
  return changed;
}
