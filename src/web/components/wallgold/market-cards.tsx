"use client";

import { useAppStore } from "@/store/app-store";
import { fmtTMN, fmtNum, fmtPercent } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Coins,
  Sparkles,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  CircleCheck,
  CircleX,
  Activity,
} from "lucide-react";

/** کارت اطلاعات بازار طلا/نقره: قیمت لحظه‌ای، وضعیت خرید/فروش، آمار ۲۴ ساعته */
export function MarketCards() {
  const markets = useAppStore((s) => s.markets);
  const marketsLoading = useAppStore((s) => s.marketsLoading);
  const persian = useAppStore((s) => s.settings.persianDigits);

  if (marketsLoading && markets.length === 0) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-6 w-40 mb-4" />
            <Skeleton className="h-10 w-56 mb-4" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {markets.map((m) => (
        <MarketCard key={m.symbol} market={m} persian={persian} />
      ))}
    </div>
  );
}

function MarketCard({
  market,
  persian,
}: {
  market: NonNullable<ReturnType<typeof useAppStore.getState>["markets"][number]>;
  persian: boolean;
}) {
  const setView = useAppStore((s) => s.setView);
  const isGold = market.symbol === "GLD_18C_750TMN";
  const mc = market.marketCap;
  const change = Number(mc?.["24hChangePrice"] ?? 0);
  const buyEnabled = market.buyStatus === "enable";
  const sellEnabled = market.sellStatus === "enable";

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isGold ? "bg-gold/15 text-gold" : "bg-muted text-muted-foreground"
              }`}
            >
              {isGold ? <Coins className="w-5 h-5" aria-hidden="true" /> : <Sparkles className="w-5 h-5" aria-hidden="true" />}
            </div>
            <div>
              <h3 className="font-bold">{market.faName}</h3>
              <p className="text-[11px] text-muted-foreground" dir="ltr">
                {market.symbol}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant={buyEnabled ? "secondary" : "destructive"} className="text-[10px] gap-1">
              {buyEnabled ? <CircleCheck className="w-3 h-3" aria-hidden="true" /> : <CircleX className="w-3 h-3" aria-hidden="true" />}
              خرید
            </Badge>
            <Badge variant={sellEnabled ? "secondary" : "destructive"} className="text-[10px] gap-1">
              {sellEnabled ? <CircleCheck className="w-3 h-3" aria-hidden="true" /> : <CircleX className="w-3 h-3" aria-hidden="true" />}
              فروش
            </Badge>
          </div>
        </div>

        {/* قیمت لحظه‌ای */}
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-xs text-muted-foreground">آخرین قیمت (تومان/گرم)</span>
          <span className={`flex items-center gap-1 text-xs ${change >= 0 ? "text-buy" : "text-sell"}`} dir="ltr">
            {change >= 0 ? (
              <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            {fmtPercent(change, persian)}
          </span>
        </div>
        <p className="text-3xl font-bold tracking-tight mb-4" dir="ltr">
          {fmtTMN(mc?.lastPrice ?? "0", persian, false)}
        </p>

        {/* آمار ۲۴ ساعته */}
        <div className="grid grid-cols-2 gap-3">
          <Stat label="قیمت خرید" value={fmtTMN(mc?.lastBuyPrice ?? "0", persian, false)} icon={<ArrowLeftRight className="w-3.5 h-3.5 text-buy" aria-hidden="true" />} />
          <Stat label="قیمت فروش" value={fmtTMN(mc?.lastSellPrice ?? "0", persian, false)} icon={<ArrowLeftRight className="w-3.5 h-3.5 text-sell" aria-hidden="true" />} />
          <Stat
            label="حجم ۲۴ ساعت (گرم)"
            value={fmtNum(Number(mc?.["24hVolume"] ?? 0), 0, persian)}
            icon={<Activity className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />}
          />
          <Stat
            label="ارزش معاملات ۲۴ ساعت"
            value={fmtTMN(mc?.["24hQuoteVolume"] ?? "0", persian, false)}
            icon={<Activity className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />}
          />
        </div>

        <div className="mt-4 pt-4 border-t border-border/60 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            کارمزد معامله: {fmtPercent(Number(market.otcFeeCoefficient) * 100, persian)} — حداقل سفارش:{" "}
            {market.minQty} گرم
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setView("trade")}
            className="text-gold border-gold/40 hover:bg-gold/10 hover:text-gold"
          >
            <ArrowLeftRight className="w-3.5 h-3.5 me-1" aria-hidden="true" />
            معامله
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <p className="text-sm font-bold" dir="ltr">
        {value}
      </p>
    </div>
  );
}
