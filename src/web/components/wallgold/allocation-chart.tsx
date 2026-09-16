"use client";

import { useAppStore } from "@/store/app-store";
import { computePortfolio } from "@/hooks/use-app-data";
import { fmtTMN } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { PieChart as PieIcon } from "lucide-react";

/** نمودار ترکیب دارایی‌ها (پای چارت) */
export function AllocationChart() {
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
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <PieIcon className="w-4.5 h-4.5 text-gold" aria-hidden="true" />
          <h3 className="font-bold">ترکیب دارایی‌ها</h3>
        </div>

        {loading && balances.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Skeleton className="h-40 w-40 rounded-full" />
          </div>
        ) : data.length === 0 || total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            هنوز دارایی‌ای برای نمایش وجود ندارد.
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="w-44 h-44 shrink-0" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={70}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {data.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
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

            <div className="w-full space-y-2.5">
              {data.map((d) => {
                const pct = total > 0 ? (d.value / total) * 100 : 0;
                return (
                  <div key={d.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} aria-hidden="true" />
                        {d.name}
                      </span>
                      <span className="text-muted-foreground" dir="ltr">
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
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
                  </div>
                );
              })}
              <p className="text-[11px] text-muted-foreground pt-1" dir="ltr">
                جمع کل: {fmtTMN(total, persian)}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
