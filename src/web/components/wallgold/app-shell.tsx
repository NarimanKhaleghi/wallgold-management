"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAppStore, type AppView } from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ArrowLeftRight,
  History,
  Settings as SettingsIcon,
  Moon,
  Sun,
  RefreshCw,
  LogOut,
  Coins,
  Loader2,
  Timer,
} from "lucide-react";

const NAV_ITEMS: { key: AppView; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "dashboard", label: "داشبورد", icon: LayoutDashboard },
  { key: "trade", label: "خرید و فروش", icon: ArrowLeftRight },
  { key: "orders", label: "سفارش‌ها", icon: History },
  { key: "settings", label: "تنظیمات", icon: SettingsIcon },
];

/** پوسته اصلی: هدر + ناوبری + محتوا + فوتر چسبان */
export function AppShell({
  children,
  onRefresh,
  expiresAt,
  serverOffset,
  onLogout,
}: {
  children: ReactNode;
  onRefresh: () => Promise<void>;
  /** زمان انقضای نشست (epoch ms — ساعت سرور) */
  expiresAt: number;
  /** اختلاف ساعت سرور و کلاینت (ms) */
  serverOffset: number;
  onLogout: () => void | Promise<void>;
}) {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const [refreshing, setRefreshing] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setPulse(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setTimeout(() => setPulse(false), 3000);
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ---------- هدر ---------- */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
          {/* لوگو و عنوان */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl border-gold-gradient flex items-center justify-center shrink-0">
              <Coins className="w-5.5 h-5.5 text-gold" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-base leading-tight truncate">
                مدیریت <span className="text-gold-gradient">وال‌گلد</span>
              </h1>
              <p className="text-[11px] text-muted-foreground leading-tight">امن و رمزنگاری‌شده</p>
            </div>
          </div>

          {/* ناوبری دسکتاپ */}
          <nav aria-label="ناوبری اصلی" className="hidden md:flex items-center gap-1 mx-auto">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => setView(item.key)}
                aria-current={view === item.key ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  view === item.key
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <item.icon className="w-4 h-4" aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </nav>

          {/* ابزارهای هدر */}
          <div className="flex items-center gap-1.5 me-auto md:me-0">
            <SessionCountdown expiresAt={expiresAt} serverOffset={serverOffset} />

            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              title="به‌روزرسانی داده‌ها"
              aria-label="به‌روزرسانی داده‌ها"
              className="relative"
            >
              {refreshing ? (
                <Loader2 className="w-4.5 h-4.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className={cn("w-4.5 h-4.5", pulse && "text-buy")} aria-hidden="true" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title="تغییر تم روشن/تاریک"
              aria-label="تغییر تم روشن/تاریک"
            >
              {theme === "dark" ? (
                <Sun className="w-4.5 h-4.5" aria-hidden="true" />
              ) : (
                <Moon className="w-4.5 h-4.5" aria-hidden="true" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              title="خروج از حساب"
              aria-label="خروج از حساب"
              disabled={loggingOut}
            >
              {loggingOut ? (
                <Loader2 className="w-4.5 h-4.5 animate-spin" aria-hidden="true" />
              ) : (
                <LogOut className="w-4.5 h-4.5" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>

        {/* نوار وضعیت به‌روزرسانی */}
        <StatusBar />
      </header>

      {/* ---------- محتوا ---------- */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 pt-6 pb-28 md:pb-10">{children}</main>

      {/* ---------- فوتر ---------- */}
      <footer className="mt-auto border-t border-border/60 py-4 px-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-[11px] text-muted-foreground">
          <span>مدیریت حساب‌های وال‌گلد — توکن‌ها رمزنگاری‌شده و بدون ارسال به سرور ثالث</span>
          <span className="hidden sm:inline">API رسمی: api.wallgold.ir</span>
        </div>
      </footer>

      {/* ---------- ناوبری موبایل (پایین صفحه) ---------- */}
      <nav
        aria-label="ناوبری موبایل"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-background/90 backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-4 h-16">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              aria-current={view === item.key ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                view === item.key ? "text-gold" : "text-muted-foreground"
              )}
            >
              <item.icon className="w-5 h-5" aria-hidden="true" />
              {item.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

/** شمارش معکوس باقی‌مانده نشست (ساعت سرور) */
function SessionCountdown({ expiresAt, serverOffset }: { expiresAt: number; serverOffset: number }) {
  const [remainingSec, setRemainingSec] = useState(() =>
    Math.max(0, Math.floor((expiresAt - (Date.now() + serverOffset)) / 1000))
  );

  useEffect(() => {
    const id = setInterval(() => {
      setRemainingSec(Math.max(0, Math.floor((expiresAt - (Date.now() + serverOffset)) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt, serverOffset]);

  const mm = String(Math.floor(remainingSec / 60)).padStart(2, "0");
  const ss = String(remainingSec % 60).padStart(2, "0");
  const danger = remainingSec <= 300;

  return (
    <div
      className={cn(
        "hidden sm:flex items-center gap-1.5 px-2.5 h-9 rounded-lg text-xs font-medium tabular-nums border",
        danger ? "text-destructive border-destructive/40 bg-destructive/10" : "text-muted-foreground border-border/60"
      )}
      title="زمان باقی‌مانده نشست شما"
      dir="ltr"
      role="timer"
      aria-label={`زمان باقی‌مانده نشست: ${mm} دقیقه و ${ss} ثانیه`}
    >
      <Timer className={cn("w-3.5 h-3.5", danger && "animate-pulse")} aria-hidden="true" />
      {mm}:{ss}
    </div>
  );
}

/** نوار آخرین به‌روزرسانی داده‌ها */
function StatusBar() {
  const marketsAt = useAppStore((s) => s.marketsAt);
  const balancesAt = useAppStore((s) => s.balancesAt);
  const marketsLoading = useAppStore((s) => s.marketsLoading);
  const balancesLoading = useAppStore((s) => s.balancesLoading);
  const accounts = useAppStore((s) => s.accounts);

  if (accounts.length === 0) return null;

  const fmt = (iso: string | null) => {
    if (!iso) return "—";
    return new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(
      new Date(iso)
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 pb-2 flex items-center gap-4 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1">
        {(marketsLoading || balancesLoading) && (
          <Loader2 className="w-3 h-3 animate-spin text-gold" aria-hidden="true" />
        )}
        بازار: {fmt(marketsAt)}
      </span>
      <span>موجودی: {fmt(balancesAt)}</span>
    </div>
  );
}
