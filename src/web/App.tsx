"use client";

/**
 * App — دروازه احراز هویت + پوسته اصلی
 *
 * جریان‌ها:
 * - «loading»: بررسی نشست فعلی
 * - «setup»:   راه‌اندازی اولیه (ساخت رمز ← فعال‌سازی 2FA ← کدهای پشتیبان)
 * - «login»:   ورود (رمز + کد 2FA در صورت فعال بودن)
 * - «authed»:  اپلیکیشن اصلی — polling فقط در این حالت فعال است
 *
 * با هر 401 از روت‌های محافظت‌شده، رویداد «wg:unauthorized» دریافت و
 * کاربر فوراً به صفحه ورود برمی‌گردد (نشست ۱ ساعته از سمت سرور اعمال می‌شود).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, UNAUTHORIZED_EVENT } from "@/lib/client-api";
import { useAppData, useAutoLogout } from "@/hooks/use-app-data";
import { useAppStore } from "@/store/app-store";
import { AppShell } from "@/components/wallgold/app-shell";
import { Dashboard } from "@/components/wallgold/dashboard";
import { AnalyticsView } from "@/components/wallgold/analytics-view";
import { TradeWizard } from "@/components/wallgold/trade-wizard";
import { OrdersView } from "@/components/wallgold/orders-view";
import { SettingsView } from "@/components/wallgold/settings-view";
import { AddAccountDialog } from "@/components/wallgold/add-account-dialog";
import { PullToRefresh } from "@/components/wallgold/pull-to-refresh";
import {
  FullScreenLoader,
  LoginScreen,
  OfflineScreen,
  SetupWizard,
} from "@/components/wallgold/auth-screens";
import { Coins, ChartLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

type AuthPhase = "loading" | "setup" | "login" | "authed" | "offline";

export default function App() {
  const [phase, setPhase] = useState<AuthPhase>("loading");
  const [has2fa, setHas2fa] = useState(false);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [serverOffset, setServerOffset] = useState(0); // serverNow - clientNow

  /* ---------- بارگذاری اولیه: بررسی نشست یا وضعیت راه‌اندازی ---------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const s = await api.auth.session();
        if (!alive) return;
        setSessionExpiresAt(s.expiresAt);
        setServerOffset(s.serverNow - Date.now());
        setHas2fa(s.has2fa);
        setPhase("authed");
      } catch (e) {
        if (!alive) return;
        // خطای شبکه (status 0) ≠ عدم راه‌اندازی — حالت آفلاین متمایز است
        if (e instanceof ApiError && e.status === 0) {
          setPhase("offline");
          return;
        }
        try {
          const st = await api.auth.status();
          if (!alive) return;
          setHas2fa(st.has2fa);
          setPhase(st.initialized ? "login" : "setup");
        } catch (e2) {
          if (!alive) return;
          if (e2 instanceof ApiError && e2.status === 0) {
            setPhase("offline");
          } else {
            setPhase("setup");
          }
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /* ---------- تلاش مجدد پس از قطع اتصال ---------- */
  const handleRetry = useCallback(() => {
    setPhase("loading");
    (async () => {
      try {
        const s = await api.auth.session();
        setSessionExpiresAt(s.expiresAt);
        setServerOffset(s.serverNow - Date.now());
        setHas2fa(s.has2fa);
        setPhase("authed");
      } catch {
        try {
          const st = await api.auth.status();
          setHas2fa(st.has2fa);
          setPhase(st.initialized ? "login" : "setup");
        } catch {
          setPhase("offline");
        }
      }
    })();
  }, []);

  /* ---------- خروج اجباری در صورت 401 (نشست منقضی) ---------- */
  useEffect(() => {
    const onUnauthorized = () => {
      setPhase((p) => {
        if (p === "authed") {
          toast.error("نشست شما منقضی شد. دوباره وارد شوید.");
        }
        return p === "authed" ? "login" : p;
      });
      setSessionExpiresAt(null);
      // به‌روزرسانی وضعیت 2FA برای صفحه ورود
      api.auth
        .status()
        .then((st) => setHas2fa(st.has2fa))
        .catch(() => {});
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  /* ---------- ورود/راه‌اندازی موفق ---------- */
  const handleAuthed = useCallback((expiresAt: number, offset = 0) => {
    setSessionExpiresAt(expiresAt);
    setServerOffset(offset);
    setPhase("authed");
  }, []);

  /* ---------- خروج ---------- */
  const handleLogout = useCallback(async () => {
    await api.auth.logout().catch(() => {});
    try {
      const st = await api.auth.status();
      setHas2fa(st.has2fa);
    } catch {
      /* نادیده بگیر */
    }
    setSessionExpiresAt(null);
    setPhase("login");
    toast.success("با موفقیت خارج شدید");
  }, []);

  if (phase === "loading")
    return (
      <>
        <FullScreenLoader />
        <Toaster />
      </>
    );

  if (phase === "offline") {
    return (
      <>
        <OfflineScreen onRetry={handleRetry} />
        <Toaster />
      </>
    );
  }

  if (phase === "setup") {
    return (
      <>
        <SetupWizard
          onComplete={(expiresAt, offset) => handleAuthed(expiresAt, offset)}
        />
        <Toaster />
      </>
    );
  }

  if (phase === "login") {
    return (
      <>
        <LoginScreen
          has2fa={has2fa}
          onLogin={(expiresAt, offset, enabled2fa) => {
            setHas2fa(enabled2fa);
            handleAuthed(expiresAt, offset);
          }}
        />
        <Toaster />
      </>
    );
  }

  return (
    <>
      <MainApp
        expiresAt={sessionExpiresAt ?? Date.now() + 3600_000}
        serverOffset={serverOffset}
        onLogout={handleLogout}
      />
      <Toaster />
    </>
  );
}

/* ------------------------------ اپلیکیشن اصلی ------------------------------ */

function MainApp({
  expiresAt,
  serverOffset,
  onLogout,
}: {
  expiresAt: number;
  serverOffset: number;
  onLogout: () => void | Promise<void>;
}) {
  const view = useAppStore((s) => s.view);
  const settings = useAppStore((s) => s.settings);
  const accounts = useAppStore((s) => s.accounts);
  const { refreshAll } = useAppData();

  /* خروج خودکار پس از بی‌فعالیتی (تنظیم کاربر — پیش‌فرض ۱۵ دقیقه) */
  useAutoLogout(settings.autoLogoutMinutes, onLogout);

  /* انقضای مطلق نشست (۱ ساعت) — شمارش معکوس در هدر */
  const expiryFired = useRef(false);
  useEffect(() => {
    expiryFired.current = false;
    const id = setInterval(() => {
      const serverNow = Date.now() + serverOffset;
      if (!expiryFired.current && serverNow >= expiresAt) {
        expiryFired.current = true;
        clearInterval(id);
        onLogout();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt, serverOffset, onLogout]);

  return (
    <AppShell onRefresh={refreshAll} expiresAt={expiresAt} serverOffset={serverOffset} onLogout={onLogout}>
      <PullToRefresh onRefresh={refreshAll}>
        {accounts.length === 0 ? (
          view === "settings" ? (
            <SettingsView />
          ) : view === "analytics" ? (
            <AnalyticsView />
          ) : (
            <EmptyState />
          )
        ) : (
          <>
            {view === "dashboard" && <Dashboard />}
            {view === "analytics" && <AnalyticsView />}
            {view === "trade" && <TradeWizard />}
            {view === "orders" && <OrdersView />}
            {view === "settings" && <SettingsView />}
          </>
        )}
      </PullToRefresh>
    </AppShell>
  );
}

/** حالت خالی — راهنمای افزودن اولین حساب وال‌گلد */
function EmptyState() {
  const setView = useAppStore((s) => s.setView);
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="w-20 h-20 rounded-3xl border-gold-gradient flex items-center justify-center mb-6">
        <Coins className="w-10 h-10 text-gold" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-bold mb-3">
        به <span className="text-gold-gradient">مدیریت حساب‌های وال‌گلد</span> خوش آمدید
      </h1>
      <p className="text-muted-foreground max-w-md leading-7 mb-2">
        برای شروع، حساب وال‌گلد خود را با توکن API اضافه کنید. پس از افزودن حساب، موجودی طلا، نقره و تومان شما
        به‌صورت لحظه‌ای نمایش داده می‌شود و می‌توانید خرید و فروش انجام دهید.
      </p>
      <p className="text-xs text-muted-foreground max-w-md leading-6 mb-8">
        توکن API را می‌توانید از پنل کاربری وال‌گلد (بخش ساخت Api-Key) دریافت کنید. توکن شما به‌صورت رمزنگاری‌شده
        (AES-256-GCM) ذخیره می‌شود و هرگز به مرورگر ارسال نمی‌گردد.
      </p>
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <AddAccountDialog />
        <Button variant="outline" onClick={() => setView("analytics")} className="gap-2 w-full sm:w-auto">
          <ChartLine className="w-4 h-4 text-gold" aria-hidden="true" />
          مشاهده نمودار قیمت بازار
        </Button>
      </div>
    </div>
  );
}
