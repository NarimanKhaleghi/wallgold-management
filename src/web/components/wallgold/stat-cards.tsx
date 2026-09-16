"use client";

import { useAppStore } from "@/store/app-store";
import { computePortfolio } from "@/hooks/use-app-data";
import { fmtTMN, fmtGram, fmtPercent, fmtNum } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Coins, Banknote, TrendingUp, TrendingDown, Lock as LockIcon } from "lucide-react";

/** کارت‌های آماری داشبورد: کل دارایی، طلا، نقره، تومان */
export function StatCards() {
  const balances = useAppStore((s) => s.balances);
  const markets = useAppStore((s) => s.markets);
  const marketsLoading = useAppStore((s) => s.marketsLoading);
  const balancesLoading = useAppStore((s) => s.balancesLoading);
  const persian = useAppStore((s) => s.settings.persianDigits);

  const portfolio = computePortfolio(balances, markets);
  const goldM = markets.find((m) => m.symbol === "GLD_18C_750TMN");
  const silverM = markets.find((m) => m.symbol === "SLV_925TMN");
  const goldChange = Number(goldM?.marketCap?.["24hChangePrice"] ?? 0);
  const silverChange = Number(silverM?.marketCap?.["24hChangePrice"] ?? 0);

  const loading = (marketsLoading && markets.length === 0) || (balancesLoading && balances.length === 0);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-4 w-24 mb-3" />
            <Skeleton className="h-8 w-36 mb-2" />
            <Skeleton className="h-3 w-20" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* کل دارایی */}
      <Card className="border-gold-gradient relative overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">ارزش کل دارایی‌ها</span>
            <Coins className="w-4.5 h-4.5 text-gold" aria-hidden="true" />
          </div>
          <p className="text-2xl font-bold tracking-tight" dir="ltr">
            {fmtTMN(portfolio.totalValue, persian, false)}
            <span className="text-sm font-normal text-muted-foreground ms-1">تومان</span>
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            بر اساس قیمت لحظه‌ای بازار
            {portfolio.failedAccounts > 0 && (
              <span className="text-destructive"> — {fmtNum(portfolio.failedAccounts, 0, persian)} حساب در دسترس نبود</span>
            )}
          </p>
        </CardContent>
      </Card>

      {/* طلا */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">طلا (۱۸ عیار ۷۵۰)</span>
            <div className="flex items-center gap-1">
              {goldChange >= 0 ? (
                <TrendingUp className="w-3.5 h-3.5 text-buy" aria-hidden="true" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-sell" aria-hidden="true" />
              )}
              <span className={goldChange >= 0 ? "text-buy text-xs" : "text-sell text-xs"} dir="ltr">
                {fmtPercent(goldChange, persian)}
              </span>
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight" dir="ltr">
            {fmtGram(portfolio.gold.amount, persian, false)}
            <span className="text-sm font-normal text-muted-foreground ms-1">گرم</span>
          </p>
          <p className="text-xs text-muted-foreground mt-2" dir="ltr">
            {fmtTMN(portfolio.goldValue, persian)}
            {portfolio.gold.locked > 0 && (
              <span className="ms-1 inline-flex items-center gap-0.5">
                <LockIcon className="w-3 h-3" aria-hidden="true" />
                {fmtGram(portfolio.gold.locked, persian, false)} قفل
              </span>
            )}
          </p>
        </CardContent>
      </Card>

      {/* نقره */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">نقره (۹۲۵)</span>
            <div className="flex items-center gap-1">
              {silverChange >= 0 ? (
                <TrendingUp className="w-3.5 h-3.5 text-buy" aria-hidden="true" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-sell" aria-hidden="true" />
              )}
              <span className={silverChange >= 0 ? "text-buy text-xs" : "text-sell text-xs"} dir="ltr">
                {fmtPercent(silverChange, persian)}
              </span>
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight" dir="ltr">
            {fmtGram(portfolio.silver.amount, persian, false)}
            <span className="text-sm font-normal text-muted-foreground ms-1">گرم</span>
          </p>
          <p className="text-xs text-muted-foreground mt-2" dir="ltr">
            {fmtTMN(portfolio.silverValue, persian)}
            {portfolio.silver.locked > 0 && (
              <span className="ms-1 inline-flex items-center gap-0.5">
                <LockIcon className="w-3 h-3" aria-hidden="true" />
                {fmtGram(portfolio.silver.locked, persian, false)} قفل
              </span>
            )}
          </p>
        </CardContent>
      </Card>

      {/* تومان */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">موجودی تومان</span>
            <Banknote className="w-4.5 h-4.5 text-muted-foreground" aria-hidden="true" />
          </div>
          <p className="text-2xl font-bold tracking-tight" dir="ltr">
            {fmtTMN(portfolio.tmn.amount, persian, false)}
            <span className="text-sm font-normal text-muted-foreground ms-1">تومان</span>
          </p>
          <p className="text-xs text-muted-foreground mt-2" dir="ltr">
            آزاد: {fmtTMN(portfolio.tmn.free, persian, false)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
