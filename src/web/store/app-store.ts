import { create } from "zustand";
import type { AppSettingsInfo, PublicAccount, Market, AccountBalances } from "@/lib/client-api";

export type AppView = "dashboard" | "analytics" | "trade" | "orders" | "settings";
export type Theme = "dark" | "light";

/** تم اولیه: از localStorage (انتخاب دستی کاربر) یا پیش‌فرض تاریک */
function initialTheme(): Theme {
  try {
    return localStorage.getItem("wg-theme") === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

const startTheme = initialTheme();
// اعمال تم قبل از رندر (جلوگیری از فلش تم اشتباه)
if (typeof document !== "undefined") {
  document.documentElement.classList.toggle("dark", startTheme === "dark");
}

interface AppState {
  /* تنظیمات */
  settings: AppSettingsInfo;
  setSettings: (s: AppSettingsInfo) => void;

  /* ناوبری */
  view: AppView;
  setView: (v: AppView) => void;

  /* حساب‌ها */
  accounts: PublicAccount[];
  setAccounts: (a: PublicAccount[]) => void;

  /* داده بازار */
  markets: Market[];
  marketsAt: string | null;
  marketsLoading: boolean;
  setMarkets: (m: Market[], at: string) => void;
  setMarketsLoading: (b: boolean) => void;

  /* موجودی حساب‌ها */
  balances: AccountBalances[];
  balancesAt: string | null;
  balancesLoading: boolean;
  setBalances: (b: AccountBalances[], at: string) => void;
  setBalancesLoading: (b: boolean) => void;

  /* تم (با افشانه جانبی: localStorage + کلاس روی <html>) */
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export const useAppStore = create<AppState>((set) => ({
  settings: {
    autoLogoutMinutes: 15,
    marketsRefreshSeconds: 30,
    balancesRefreshSeconds: 60,
    persianDigits: true,
    highValueWarningTMN: 50_000_000,
    defaultTheme: "dark",
  },
  setSettings: (s) => set({ settings: s }),

  view: "dashboard",
  setView: (v) => set({ view: v }),

  accounts: [],
  setAccounts: (a) => set({ accounts: a }),

  markets: [],
  marketsAt: null,
  marketsLoading: false,
  setMarkets: (m, at) => set({ markets: m, marketsAt: at }),
  setMarketsLoading: (b) => set({ marketsLoading: b }),

  balances: [],
  balancesAt: null,
  balancesLoading: false,
  setBalances: (b, at) => set({ balances: b, balancesAt: at }),
  setBalancesLoading: (b) => set({ balancesLoading: b }),

  theme: startTheme,
  setTheme: (t) => {
    set({ theme: t });
    try {
      localStorage.setItem("wg-theme", t);
    } catch {
      /* حافظه پر است — نادیده بگیر */
    }
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", t === "dark");
    }
  },
}));
