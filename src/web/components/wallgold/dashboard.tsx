"use client";

import { StatCards } from "./stat-cards";
import { MarketCards } from "./market-cards";
import { AllocationChart } from "./allocation-chart";
import { AccountsTable } from "./accounts-table";
import { useAppStore } from "@/store/app-store";
import { AddAccountDialog } from "./add-account-dialog";
import { EyeOff } from "lucide-react";

/** داشبورد اصلی */
export function Dashboard() {
  const accounts = useAppStore((s) => s.accounts);
  const visibleCount = accounts.filter((a) => a.visible).length;

  return (
    <div className="space-y-6">
      {/* کارت‌های آماری */}
      <StatCards />

      {/* نمودار + وضعیت بازارها */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2">
          <AllocationChart />
        </div>
        <div className="lg:col-span-3 space-y-4">
          <MarketCards />
        </div>
      </div>

      {/* هشدار حساب‌های پنهان */}
      {visibleCount < accounts.length && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-4 py-3">
          <EyeOff className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>
            {accounts.length - visibleCount} حساب از داشبورد پنهان است. برای نمایش مجدد، از بخش تنظیمات → مدیریت
            حساب‌ها استفاده کنید.
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
