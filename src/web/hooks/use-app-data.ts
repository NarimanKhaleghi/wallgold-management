"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "@/store/app-store";
import { api, type AccountBalances, type Market } from "@/lib/client-api";

/** جمع موجودی یک ارز در تمام حساب‌ها */
export interface CurrencyTotal {
  currency: string;
  amount: number; // کل
  locked: number; // بلاک‌شده
  free: number; // آزاد
}

export interface Portfolio {
  gold: CurrencyTotal;
  silver: CurrencyTotal;
  tmn: CurrencyTotal;
  goldPrice: number; // آخرین قیمت طلا (تومان/گرم)
  silverPrice: number;
  goldValue: number; // ارزش ریالی طلای کل
  silverValue: number;
  totalValue: number; // کل دارایی به تومان
  hasAnyBalance: boolean;
  failedAccounts: number;
}

/** محاسبه پورتفوی کل از موجودی حساب‌ها و قیمت لحظه‌ای بازار */
export function computePortfolio(balances: AccountBalances[], markets: Market[]): Portfolio {
  const goldM = markets.find((m) => m.symbol === "GLD_18C_750TMN");
  const silverM = markets.find((m) => m.symbol === "SLV_925TMN");
  const goldPrice = Number(goldM?.marketCap?.lastPrice ?? 0) || 0;
  const silverPrice = Number(silverM?.marketCap?.lastPrice ?? 0) || 0;

  const total = (currency: string): CurrencyTotal => {
    let amount = 0,
      locked = 0;
    for (const acc of balances) {
      if (!acc.ok) continue;
      const b = acc.balances.find((x) => x.currency === currency);
      if (b) {
        amount += Number(b.amount) || 0;
        locked += Number(b.locked_amount) || 0;
      }
    }
    return { currency, amount, locked, free: Math.max(0, amount - locked) };
  };

  const gold = total("GLD_18C_750");
  const silver = total("SLV_925");
  const tmn = total("TMN");
  const goldValue = gold.amount * goldPrice;
  const silverValue = silver.amount * silverPrice;

  const hasAnyBalance = balances.some((a) => a.ok && a.balances.length > 0);

  return {
    gold,
    silver,
    tmn,
    goldPrice,
    silverPrice,
    goldValue,
    silverValue,
    totalValue: goldValue + silverValue + tmn.amount,
    hasAnyBalance,
    failedAccounts: balances.filter((a) => !a.ok).length,
  };
}

/**
 * hook اصلی داده‌ها — فقط زمانی که کاربر وارد شده باشد mount می‌شود
 * (AuthGate تضمین می‌کند پس از خروج، همه polling‌ها متوقف شوند)
 */
export function useAppData() {
  const store = useAppStore();
  const initDone = useRef(false);

  const refreshMarkets = useCallback(
    async (force = false) => {
      store.setMarketsLoading(true);
      try {
        const { markets, serverTime } = await api.getMarkets(force);
        store.setMarkets(markets, serverTime);
      } catch (e) {
        console.warn("markets refresh failed:", e instanceof Error ? e.message : e);
      } finally {
        store.setMarketsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const refreshBalances = useCallback(async () => {
    store.setBalancesLoading(true);
    try {
      const { results } = await api.getBalances();
      store.setBalances(results, new Date().toISOString());
    } catch (e) {
      console.warn("balances refresh failed:", e instanceof Error ? e.message : e);
    } finally {
      store.setBalancesLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAccounts = useCallback(async () => {
    try {
      const { accounts } = await api.getAccounts();
      store.setAccounts(accounts);
    } catch (e) {
      console.warn("accounts refresh failed:", e instanceof Error ? e.message : e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([refreshMarkets(true), refreshBalances(), refreshAccounts()]);
  }, [refreshMarkets, refreshBalances, refreshAccounts]);

  /* ---- بارگذاری اولیه (تنها یک‌بار در عمر mount) ---- */
  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    (async () => {
      try {
        const { settings } = await api.getSettings();
        store.setSettings(settings);
        // تم پیش‌فرض سرور فقط وقتی اعمال شود که کاربر خودش انتخابی نکرده باشد
        if (!localStorage.getItem("wg-theme")) {
          store.setTheme(settings.defaultTheme);
        }
      } catch {
        // ادامه با مقادیر پیش‌فرض
      }
      await Promise.allSettled([refreshAccounts(), refreshMarkets(), refreshBalances()]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- به‌روزرسانی خودکار بازارها ---- */
  useEffect(() => {
    const sec = store.settings.marketsRefreshSeconds;
    if (!sec || sec <= 0) return;
    const id = setInterval(() => {
      refreshMarkets();
    }, sec * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.settings.marketsRefreshSeconds, refreshMarkets]);

  /* ---- به‌روزرسانی خودکار موجودی ---- */
  useEffect(() => {
    const sec = store.settings.balancesRefreshSeconds;
    if (!sec || sec <= 0) return;
    const id = setInterval(
      () => {
        refreshBalances();
      },
      sec * 1000
    );
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.settings.balancesRefreshSeconds, refreshBalances]);

  /* ---- موجودی پس از تغییر تعداد حساب‌ها دوباره دریافت شود ---- */
  useEffect(() => {
    if (initDone.current) {
      refreshBalances();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.accounts.length]);

  return { refreshMarkets, refreshBalances, refreshAccounts, refreshAll };
}

/**
 * خروج خودکار پس از عدم فعالیت (نشست واقعی را ابطال می‌کند)
 * @param minutes دقیقه بی‌فعالیتی (۰ = غیرفعال)
 */
export function useAutoLogout(minutes: number, onLogout: () => void | Promise<void>) {
  const ref = useRef(onLogout);
  ref.current = onLogout;

  useEffect(() => {
    if (!minutes || minutes <= 0) return;
    let timer: ReturnType<typeof setTimeout>;
    let fired = false;

    const reset = () => {
      clearTimeout(timer);
      if (!fired) {
        timer = setTimeout(async () => {
          fired = true;
          await ref.current();
        }, minutes * 60 * 1000);
      }
    };

    const events: (keyof WindowEventMap)[] = ["mousemove", "keydown", "touchstart", "click", "scroll"];
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [minutes]);
}
