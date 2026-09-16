"use client";

import { useAppStore } from "@/store/app-store";
import { fmtTMN, fmtGram, fmtNum, fmtDateTime } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eye, EyeOff, CircleCheck, CircleAlert } from "lucide-react";

/** جدول تفکیکی حساب‌ها */
export function AccountsTable() {
  const accounts = useAppStore((s) => s.accounts);
  const balances = useAppStore((s) => s.balances);
  const markets = useAppStore((s) => s.markets);
  const loading = useAppStore((s) => s.balancesLoading);
  const persian = useAppStore((s) => s.settings.persianDigits);

  const goldPrice = Number(markets.find((m) => m.symbol === "GLD_18C_750TMN")?.marketCap?.lastPrice ?? 0);
  const silverPrice = Number(markets.find((m) => m.symbol === "SLV_925TMN")?.marketCap?.lastPrice ?? 0);

  const rows = accounts.map((acc) => {
    const b = balances.find((x) => x.accountId === acc.id);
    const get = (currency: string) => {
      const item = b?.balances.find((x) => x.currency === currency);
      return { amount: Number(item?.amount ?? 0), locked: Number(item?.locked_amount ?? 0) };
    };
    const gold = get("GLD_18C_750");
    const silver = get("SLV_925");
    const tmn = get("TMN");
    const total = gold.amount * goldPrice + silver.amount * silverPrice + tmn.amount;
    return { acc, b, gold, silver, tmn, total };
  });

  return (
    <Card>
      <CardContent className="p-0">
        <div className="p-5 pb-0 flex items-center justify-between">
          <h3 className="font-bold">موجودی تفکیکی حساب‌ها</h3>
          <Badge variant="secondary" className="text-xs">
            {fmtNum(accounts.length, 0, persian)} حساب
          </Badge>
        </div>

        {/* موبایل: کارت */}
        <div className="md:hidden divide-y divide-border/60">
          {rows.map(({ acc, b, gold, silver, tmn, total }) => (
            <div key={acc.id} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  {acc.visible ? (
                    <Eye className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                  )}
                  <span className="font-medium truncate">{acc.name}</span>
                </div>
                {b?.ok ? (
                  <CircleCheck className="w-4 h-4 text-buy shrink-0" aria-label="در دسترس" />
                ) : (
                  <CircleAlert className="w-4 h-4 text-destructive shrink-0" aria-label="خطا در دریافت" />
                )}
              </div>
              <div className="grid grid-cols-4 gap-2 text-[11px]">
                <MiniStat label="طلا" value={fmtGram(gold.amount, persian, false)} />
                <MiniStat label="نقره" value={fmtGram(silver.amount, persian, false)} />
                <MiniStat label="تومان" value={fmtTMN(tmn.amount, persian, false)} />
                <MiniStat label="ارزش کل" value={fmtTMN(total, persian, false)} highlight />
              </div>
              {b && !b.ok && <p className="text-destructive text-[11px] mt-2 leading-5">{b.error}</p>}
            </div>
          ))}
        </div>

        {/* دسکتاپ: جدول */}
        <div className="hidden md:block overflow-x-auto thin-scrollbar">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-start">حساب</TableHead>
                <TableHead className="text-start">طلا (گرم)</TableHead>
                <TableHead className="text-start">نقره (گرم)</TableHead>
                <TableHead className="text-start">تومان</TableHead>
                <TableHead className="text-start">ارزش کل</TableHead>
                <TableHead className="text-start">وضعیت</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && balances.length === 0
                ? [0, 1, 2].map((i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : rows.map(({ acc, b, gold, silver, tmn, total }) => (
                    <TableRow key={acc.id}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {acc.visible ? (
                            <Eye className="w-3.5 h-3.5 text-muted-foreground" aria-label="نمایان در داشبورد" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-muted-foreground" aria-label="پنهان از داشبورد" />
                          )}
                          {acc.name}
                        </span>
                        {b?.fetchedAt && (
                          <span className="text-[10px] text-muted-foreground block">
                            {fmtDateTime(b.fetchedAt, persian)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell dir="ltr">
                        {fmtGram(gold.amount, persian, false)}
                        {gold.locked > 0 && (
                          <span className="text-[10px] text-muted-foreground"> ({fmtGram(gold.locked, persian, false)} قفل)</span>
                        )}
                      </TableCell>
                      <TableCell dir="ltr">
                        {fmtGram(silver.amount, persian, false)}
                        {silver.locked > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {" "}
                            ({fmtGram(silver.locked, persian, false)} قفل)
                          </span>
                        )}
                      </TableCell>
                      <TableCell dir="ltr">{fmtTMN(tmn.amount, persian, false)}</TableCell>
                      <TableCell dir="ltr" className="font-bold text-gold">
                        {fmtTMN(total, persian, false)}
                      </TableCell>
                      <TableCell>
                        {b?.ok ? (
                          <Badge variant="secondary" className="gap-1 text-[10px]">
                            <CircleCheck className="w-3 h-3 text-buy" aria-hidden="true" />
                            سالم
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1 text-[10px]" title={b?.error}>
                            <CircleAlert className="w-3 h-3" aria-hidden="true" />
                            خطا
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-muted/50 rounded-lg p-2">
      <p className="text-muted-foreground mb-0.5">{label}</p>
      <p className={`font-bold text-[11px] ${highlight ? "text-gold" : ""}`} dir="ltr">
        {value}
      </p>
    </div>
  );
}
