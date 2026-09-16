"use client";

import { useAppStore } from "@/store/app-store";
import { computePortfolio } from "@/hooks/use-app-data";
import { StatCards } from "./stat-cards";
import { MarketCards } from "./market-cards";
import { AccountsTable } from "./accounts-table";
import { AddAccountDialog } from "./add-account-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toPersianDigits } from "@/lib/format";
import { EyeOff, ChartLine, ArrowLeft } from "lucide-react";

/** داشبورد اصلی — نمای کلی تمیز و متمرکز:
 *  آمار کلیدی ← نوار ترکیب دارایی ← قیمت لحظه‌ای بازار ← جدول حساب‌ها */
export function Dashboard() {
  const accounts = useAppStore((s) => s.accounts);
  const setView = useAppStore((s) => s.setView);
  const visibleCount = accounts.filter((a) => a.visible).length;

  return (
    <div className="space-y-5">
      {/* کارت‌های آماری کلیدی */}
      <StatCards />

      {/* نوار ترکیب دارایی + میان‌بر تحلیل */}
      <AllocationStrip onOpenAnalytics={() => setView("analytics")} />

      {/* قیمت لحظه‌ای بازارها */}
      <MarketCards />

      {/* هشدار حساب‌های پنهان */}
      {visibleCount < accounts.length && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-4 py-3">
          <EyeOff className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>
            {toPersianDigits(String(accounts.length - visibleCount))} حساب از داشبورد پنهان است. برای نمایش مجدد، از
            بخش تنظیمات ← حساب‌ها استفاده کنید.
          </span>
        </div>
      )}

      {/* جدول حساب‌ها */}
      <AccountsTable />

      {/* راهنمای شروع سریع */}
      {accounts.length > 0 && accounts.length < 2 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between bg-accent/40 border border-gold/20 rounded-xl px-5 py-4">
          <p className="text-sm leading-6">
            حساب دیگری دارید؟ حساب‌های بیشتری اضافه کنید تا مجموع دارایی‌های همه در یک نما نمایش داده شود.
          </p>
          <AddAccountDialog />
        </div>
      )}
    </div>
  );
}

/** نوار فشرده ترکیب دارایی با میان‌بر به نمودارهای کامل */
function AllocationStrip({ onOpenAnalytics }: { onOpenAnalytics: () => void }) {
  const balances = useAppStore((s) => s.balances);
  const markets = useAppStore((s) => s.markets);
  const portfolio = computePortfolio(balances, markets);

  const parts = [
    { name: "طلا", value: portfolio.goldValue, color: "var(--gold)" },
    { name: "نقره", value: portfolio.silverValue, color: "var(--chart-2)" },
    { name: "تومان", value: portfolio.tmn.amount, color: "var(--chart-3)" },
  ].filter((p) => p.value > 0);
  const total = parts.reduce((s, p) => s + p.value, 0);

  if (total <= 0) return null;

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 min-w-0">
            {parts.map((p) => {
              const pct = (p.value / total) * 100;
              return (
                <span key={p.name} className="flex items-center gap-1.5 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.color }} aria-hidden="true" />
                  <span className="text-muted-foreground">{p.name}</span>
                  <span className="font-bold tabular-nums" dir="ltr">
                    {toPersianDigits(pct.toFixed(1))}%
                  </span>
                </span>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenAnalytics}
            className="text-gold border-gold/40 hover:bg-gold/10 hover:text-gold shrink-0 gap-1.5"
          >
            <ChartLine className="w-3.5 h-3.5" aria-hidden="true" />
            نمودارها
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          </Button>
        </div>
        <div
          className="h-2.5 rounded-full overflow-hidden flex"
          role="progressbar"
          aria-label="ترکیب دارایی‌ها"
          aria-valuemin={0}
          aria-valuemax={100}
        >
          {parts.map((p) => (
            <div
              key={p.name}
              className="h-full transition-all"
              style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
              title={`${p.name}: ${toPersianDigits(((p.value / total) * 100).toFixed(1))}%`}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
