"use client";

/**
 * نمای تحلیل: نمودارهای قیمت، ارزش دارایی، آمار معاملات و ترکیب دارایی
 *
 * - نمودار قیمت طلا/نقره (AreaChart) با بازه ۲۴ ساعت / ۷ روز / ۳۰ روز
 * - نمودار ارزش کل دارایی در طول زمان
 * - آمار معاملات: تعداد، حجم، ارزش، کارمزد و سود/زیان (محقق‌شده فیفو + بالقوه)
 * - مقایسه خرید/فروش و ترکیب لحظه‌ای دارایی‌ها
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { computePortfolio } from "@/hooks/use-app-data";
import {
  api,
  ApiError,
  type AnalyticsData,
  type AnalyticsRange,
  type MarketTradeStats,
  type PriceSeries,
} from "@/lib/client-api";
import { fmtTMN, fmtGram, fmtNum, toPersianDigits } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  LineChart as LineChartIcon,
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowLeftRight,
  Coins,
  Sparkles,
  RefreshCw,
  Loader2,
  PieChart as PieIcon,
  Percent,
  ReceiptText,
} from "lucide-react";
import { cn } from "@/lib/utils";

const RANGES: { key: AnalyticsRange; label: string }[] = [
  { key: "24h", label: "۲۴ ساعت" },
  { key: "7d", label: "۷ روز" },
  { key: "30d", label: "۳۰ روز" },
];

export function AnalyticsView() {
  const [range, setRange] = useState<AnalyticsRange>("24h");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (r: AnalyticsRange, soft = false) => {
      if (soft) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await api.getAnalytics(r);
        setData(res);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return;
        console.warn("analytics load failed", e);
        setData(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    load(range);
  }, [range, load]);

  return (
    <div className="space-y-5">
      {/* هدر + انتخاب بازه */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <LineChartIcon className="w-5 h-5 text-gold" aria-hidden="true" />
          تحلیل و نمودارها
        </h2>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center p-1 rounded-xl bg-muted/60 border border-border/60 gap-1"
            role="tablist"
            aria-label="بازه زمانی نمودارها"
          >
            {RANGES.map((r) => (
              <button
                key={r.key}
                role="tab"
                aria-selected={range === r.key}
                onClick={() => setRange(r.key)}
                className={cn(
                  "px-3 h-8 rounded-lg text-xs font-medium transition-colors min-h-0",
                  range === r.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10"
            onClick={() => load(range, true)}
            disabled={refreshing}
            title="به‌روزرسانی تحلیل"
            aria-label="به‌روزرسانی تحلیل"
          >
            <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="space-y-5">
          <Card className="p-5">
            <Skeleton className="h-5 w-40 mb-4" />
            <Skeleton className="h-56 w-full" />
          </Card>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <Skeleton className="h-5 w-36 mb-4" />
              <Skeleton className="h-56 w-full" />
            </Card>
            <Card className="p-5">
              <Skeleton className="h-5 w-36 mb-4" />
              <Skeleton className="h-56 w-full" />
            </Card>
          </div>
        </div>
      ) : (
        <>
          <PriceChartCard data={data} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <PortfolioChartCard data={data} />
            <TradeStatsCard trades={data?.trades} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <BuySellCard trades={data?.trades} />
            <LiveAllocationCard />
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------ ابزار مشترک ------------------------------ */

/** قالب فشرده مبالغ بزرگ برای محور عمودی (مثلاً ۸٫۵ م) */
function useCompactFmt() {
  const persian = useAppStore((s) => s.settings.persianDigits);
  return useCallback(
    (n: number): string => {
      const abs = Math.abs(n);
      let s: string;
      if (abs >= 1e9) s = `${(n / 1e9).toFixed(1)} میلیارد`;
      else if (abs >= 1e6) s = `${(n / 1e6).toFixed(1)} م`;
      else if (abs >= 1e3) s = `${(n / 1e3).toFixed(0)} ه`;
      else s = String(Math.round(n));
      return persian ? toPersianDigits(s) : s;
    },
    [persian]
  );
}

/** قالب زمان تیک‌ها بر اساس بازه */
function useTimeFmt() {
  return useCallback((t: number, range: AnalyticsRange) => {
    const d = new Date(t);
    if (range === "24h") {
      return new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(d);
    }
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "2-digit", day: "2-digit" }).format(d);
  }, []);
}

/** تولتیپ سفارشی هم‌سبک با تم */
function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
}: {
  active?: boolean;
  payload?: Array<{ value?: number | string; name?: string; dataKey?: string | number }>;
  label?: number | string;
  formatter?: (v: number, key: string) => string;
  labelFormatter?: (l: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg max-w-[220px]"
      dir="rtl"
    >
      {typeof label === "number" && labelFormatter && (
        <p className="text-muted-foreground mb-1">{labelFormatter(label)}</p>
      )}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center justify-between gap-3 py-0.5">
          <span className="text-muted-foreground">{p.name}</span>
          <span className="font-bold tabular-nums" dir="ltr">
            {formatter && typeof p.value === "number" ? formatter(p.value, String(p.dataKey)) : String(p.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

/* ------------------------------ نمودار قیمت ------------------------------ */

function PriceChartCard({ data }: { data: AnalyticsData | null }) {
  const persian = useAppStore((s) => s.settings.persianDigits);
  const compact = useCompactFmt();
  const timeFmt = useTimeFmt();
  const [metal, setMetal] = useState<"gold" | "silver">("gold");

  const series: PriceSeries | undefined = data?.prices.find(
    (p) => p.symbol === (metal === "gold" ? "GLD_18C_750TMN" : "SLV_925TMN")
  );
  const points = series?.points ?? [];
  const range = data?.range ?? "24h";

  const first = points.length > 0 ? points[0].price : 0;
  const last = points.length > 0 ? points[points.length - 1].price : 0;
  const change = first > 0 ? ((last - first) / first) * 100 : 0;
  const up = change >= 0;

  return (
    <Card className="bg-gold-wash">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center",
                metal === "gold" ? "bg-gold/15 text-gold" : "bg-muted text-muted-foreground"
              )}
            >
              {metal === "gold" ? (
                <Coins className="w-4.5 h-4.5" aria-hidden="true" />
              ) : (
                <Sparkles className="w-4.5 h-4.5" aria-hidden="true" />
              )}
            </div>
            <div>
              <h3 className="font-bold leading-tight">
                روند قیمت {metal === "gold" ? "طلا (۱۸ عیار ۷۵۰)" : "نقره (۹۲۵)"}
              </h3>
              <p className="text-[11px] text-muted-foreground">تومان بر گرم — منبع: بازار وال‌گلد</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {points.length > 0 && (
              <span
                className={cn(
                  "flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg",
                  up ? "text-buy bg-buy/10" : "text-sell bg-sell/10"
                )}
                dir="ltr"
              >
                {up ? <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" /> : <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" />}
                {toPersianDigits(`${up ? "+" : ""}${change.toFixed(2)}%`)}
              </span>
            )}
            <div className="flex p-1 rounded-xl bg-muted/60 border border-border/60 gap-1" role="tablist" aria-label="انتخاب فلز">
              <button
                role="tab"
                aria-selected={metal === "gold"}
                onClick={() => setMetal("gold")}
                className={cn(
                  "px-3 h-8 rounded-lg text-xs font-medium transition-colors",
                  metal === "gold" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                طلا
              </button>
              <button
                role="tab"
                aria-selected={metal === "silver"}
                onClick={() => setMetal("silver")}
                className={cn(
                  "px-3 h-8 rounded-lg text-xs font-medium transition-colors",
                  metal === "silver" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                نقره
              </button>
            </div>
          </div>
        </div>

        <div dir="ltr" className="h-60 sm:h-72 -mx-2">
          {points.length < 2 ? (
            <ChartEmptyState />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id={`priceFill-${metal}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="var(--gold)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(t: number) => timeFmt(t, range)}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                  minTickGap={48}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tickFormatter={compact}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  content={
                    <ChartTooltip
                      formatter={(v) => fmtTMN(v, persian)}
                      labelFormatter={(t) => timeFmt(t, range)}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  name="قیمت لحظه‌ای"
                  stroke="var(--gold)"
                  strokeWidth={2}
                  fill={`url(#priceFill-${metal})`}
                  dot={false}
                  activeDot={{ r: 4, fill: "var(--gold)", strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------- نمودار ارزش دارایی -------------------------- */

function PortfolioChartCard({ data }: { data: AnalyticsData | null }) {
  const persian = useAppStore((s) => s.settings.persianDigits);
  const compact = useCompactFmt();
  const timeFmt = useTimeFmt();
  const points = data?.portfolio ?? [];
  const range = data?.range ?? "24h";

  const first = points.length > 0 ? points[0].value : 0;
  const last = points.length > 0 ? points[points.length - 1].value : 0;
  const diff = last - first;
  const pct = first > 0 ? (diff / first) * 100 : 0;

  return (
    <Card className="h-full">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-4.5 h-4.5 text-gold" aria-hidden="true" />
            <h3 className="font-bold">ارزش کل دارایی‌ها</h3>
          </div>
          {points.length > 1 && (
            <span
              className={cn(
                "text-xs font-bold px-2 py-1 rounded-lg tabular-nums",
                diff >= 0 ? "text-buy bg-buy/10" : "text-sell bg-sell/10"
              )}
              dir="ltr"
            >
              {toPersianDigits(`${diff >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(2)}%`)}
            </span>
          )}
        </div>

        <div dir="ltr" className="h-52 sm:h-56 -mx-2">
          {points.length < 2 ? (
            <ChartEmptyState text="ارزش دارایی شما با استفاده مداوم از اپ ثبت و اینجا نمایش داده می‌شود." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
                <defs>
                  <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(t: number) => timeFmt(t, range)}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                  minTickGap={48}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tickFormatter={compact}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  content={
                    <ChartTooltip formatter={(v) => fmtTMN(v, persian)} labelFormatter={(t) => timeFmt(t, range)} />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  name="ارزش کل"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  fill="url(#portfolioFill)"
                  dot={false}
                  activeDot={{ r: 4, fill: "var(--chart-2)", strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* --------------------------- آمار معاملات (P&L) --------------------------- */

function TradeStatsCard({ trades }: { trades?: { gold: MarketTradeStats; silver: MarketTradeStats } }) {
  const persian = useAppStore((s) => s.settings.persianDigits);

  if (!trades) return null;

  const t = trades.gold;
  const s = trades.silver;
  const totalTrades = t.buyCount + t.sellCount + s.buyCount + s.sellCount;
  const totalFees = t.fees + s.fees;
  const realized = t.realizedPnl + s.realizedPnl;
  const unrealized = t.unrealizedPnl + s.unrealizedPnl;

  const pnlBox = (label: string, value: number, hint: string) => (
    <div className="rounded-xl border border-border/60 p-3.5">
      <p className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
        <Percent className="w-3 h-3" aria-hidden="true" />
        {label}
      </p>
      <p
        className={cn("text-lg font-bold tabular-nums leading-tight", value > 0 ? "text-buy" : value < 0 ? "text-sell" : "")}
        dir="ltr"
      >
        {value > 0 ? "+" : value < 0 ? "−" : ""}
        {fmtTMN(Math.abs(value), persian, false)}
      </p>
      <p className="text-[10px] text-muted-foreground mt-1 leading-4">{hint}</p>
    </div>
  );

  return (
    <Card className="h-full">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ReceiptText className="w-4.5 h-4.5 text-gold" aria-hidden="true" />
            <h3 className="font-bold">عملکرد معاملات</h3>
          </div>
          <Badge variant="secondary" className="text-[10px]">
            {fmtNum(totalTrades, 0, persian)} سفارش تکمیل‌شده
          </Badge>
        </div>

        {totalTrades === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground leading-7">
            هنوز معامله‌ای تکمیل‌شده ثبت نشده است.
            <br />
            پس از خرید و فروش، سود و زیان به‌صورت خودکار بر مبنای فیفو محاسبه می‌شود.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {/* طلا */}
              <div className="rounded-xl border border-border/60 p-3.5">
                <p className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
                  <Coins className="w-3 h-3 text-gold" aria-hidden="true" />
                  حجم خرید طلا
                </p>
                <p className="text-lg font-bold tabular-nums leading-tight" dir="ltr">
                  {fmtGram(t.buyVolume, persian, false)}
                  <span className="text-[11px] font-normal text-muted-foreground ms-1">گرم</span>
                </p>
                <p className="text-[10px] text-muted-foreground mt-1" dir="ltr">
                  فروش: {fmtGram(t.sellVolume, persian, false)} گرم
                </p>
              </div>
              {/* نقره */}
              <div className="rounded-xl border border-border/60 p-3.5">
                <p className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" aria-hidden="true" />
                  حجم خرید نقره
                </p>
                <p className="text-lg font-bold tabular-nums leading-tight" dir="ltr">
                  {fmtGram(s.buyVolume, persian, false)}
                  <span className="text-[11px] font-normal text-muted-foreground ms-1">گرم</span>
                </p>
                <p className="text-[10px] text-muted-foreground mt-1" dir="ltr">
                  فروش: {fmtGram(s.sellVolume, persian, false)} گرم
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {pnlBox("سود/زیان محقق‌شده", realized, "مبنای فیفو — از فروش‌های تکمیل‌شده")}
              {pnlBox("سود/زیان بالقوه", unrealized, "دارایی باقیمانده با قیمت لحظه‌ای")}
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
              <span className="flex items-center gap-1">
                <ReceiptText className="w-3 h-3" aria-hidden="true" />
                کارمزد پرداخت‌شده:
              </span>
              <span className="font-bold tabular-nums" dir="ltr">
                {fmtTMN(totalFees, persian)}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* --------------------------- مقایسه خرید / فروش --------------------------- */

function BuySellCard({ trades }: { trades?: { gold: MarketTradeStats; silver: MarketTradeStats } }) {
  const persian = useAppStore((s) => s.settings.persianDigits);
  const compact = useCompactFmt();

  if (!trades) return null;
  const data = [
    { name: "خرید طلا", value: Math.round(trades.gold.buyValue), fill: "var(--gold)" },
    { name: "فروش طلا", value: Math.round(trades.gold.sellValue), fill: "var(--gold-soft)" },
    { name: "خرید نقره", value: Math.round(trades.silver.buyValue), fill: "var(--chart-2)" },
    { name: "فروش نقره", value: Math.round(trades.silver.sellValue), fill: "var(--chart-3)" },
  ].filter((d) => d.value > 0);

  return (
    <Card className="h-full">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="w-4.5 h-4.5 text-gold" aria-hidden="true" />
          <h3 className="font-bold">ارزش خرید و فروش</h3>
        </div>

        {data.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            پس از اولین معامله، مقایسه ارزش خرید و فروش اینجا نمایش داده می‌شود.
          </div>
        ) : (
          <>
            <div dir="ltr" className="h-56 -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis
                    tickFormatter={compact}
                    tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                    content={<ChartTooltip formatter={(v) => fmtTMN(v, persian)} />}
                  />
                  <Bar dataKey="value" name="ارزش" radius={[6, 6, 0, 0]} maxBarSize={56}>
                    {data.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-muted-foreground leading-5 text-center">
              جمع ارزش کل سفارش‌های تکمیل‌شده به تفکیک جهت و فلز
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------ ترکیب لحظه‌ای دارایی‌ها ------------------------ */

function LiveAllocationCard() {
  const balances = useAppStore((s) => s.balances);
  const markets = useAppStore((s) => s.markets);
  const loading = useAppStore((s) => s.balancesLoading);
  const persian = useAppStore((s) => s.settings.persianDigits);

  const portfolio = computePortfolio(balances, markets);
  const data = [
    { name: "طلا", value: Math.round(portfolio.goldValue), color: "var(--gold)" },
    { name: "نقره", value: Math.round(portfolio.silverValue), color: "var(--chart-2)" },
    { name: "تومان", value: Math.round(portfolio.tmn.amount), color: "var(--chart-3)" },
  ].filter((d) => d.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <Card className="h-full">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <PieIcon className="w-4.5 h-4.5 text-gold" aria-hidden="true" />
          <h3 className="font-bold">ترکیب لحظه‌ای دارایی</h3>
        </div>

        {loading && balances.length === 0 ? (
          <div className="flex justify-center py-8">
            <Skeleton className="h-40 w-40 rounded-full" />
          </div>
        ) : data.length === 0 || total === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground leading-7">
            هنوز دارایی‌ای ثبت نشده است.
            <br />
            با افزودن حساب وال‌گلد، ترکیب دارایی به‌صورت لحظه‌ای نمایش داده می‌شود.
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="w-40 h-40 shrink-0" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={44}
                    outerRadius={66}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {data.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [fmtTMN(value, persian, false) + " تومان", name]}
                    contentStyle={{
                      direction: "rtl",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full space-y-3">
              {data.map((d) => {
                const pct = total > 0 ? (d.value / total) * 100 : 0;
                return (
                  <div key={d.name}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} aria-hidden="true" />
                        {d.name}
                      </span>
                      <span className="font-bold tabular-nums" dir="ltr">
                        {toPersianDigits(pct.toFixed(1))}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: d.color }}
                        role="progressbar"
                        aria-valuenow={Math.round(pct)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`سهم ${d.name}`}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 tabular-nums" dir="ltr">
                      {fmtTMN(d.value, persian)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------ حالت خالی ------------------------------ */

function ChartEmptyState({ text }: { text?: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 py-8 gap-2">
      <Loader2 className="w-5 h-5 text-muted-foreground/50" aria-hidden="true" />
      <p className="text-sm text-muted-foreground leading-6 max-w-xs">
        {text ?? "داده کافی برای رسم نمودار وجود ندارد — داده‌ها به‌صورت خودکار و در طول استفاده شما جمع‌آوری می‌شوند."}
      </p>
    </div>
  );
}
