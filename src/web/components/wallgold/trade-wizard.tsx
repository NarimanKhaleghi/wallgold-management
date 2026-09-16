"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { api, ApiError, type Market, type Balance, type WgPriceInfo, type WgOrderInfo } from "@/lib/client-api";
import { fmtTMN, fmtGram, toPersianDigits, fmtNum, fmtDateTime, fmtCountdown, orderStatusLabel } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Coins,
  Sparkles,
  ArrowLeftRight,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Timer,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  ChevronsLeft,
  KeyRound,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** نرمال‌سازی ورودی مقدار: ارقام فارسی → انگلیسی و اعشار */
function normalizeAmount(input: string): string {
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  let s = input.replace(/[۰-۹]/g, (d) => String(fa.indexOf(d)));
  s = s.replace(/[٫,]/g, ".");
  s = s.replace(/[^0-9.]/g, "");
  // فقط یک نقطه
  const parts = s.split(".");
  if (parts.length > 2) s = parts[0] + "." + parts.slice(1).join("");
  // حداکثر ۳ رقم اعشار
  if (parts.length === 2 && parts[1].length > 3) s = parts[0] + "." + parts[1].slice(0, 3);
  return s;
}

const STEPS = ["انتخاب پارامترها", "قیمت معتبر", "تأیید نهایی", "ثبت و پیگیری"];
const CONFIRM_PHRASE = "تأیید می‌کنم";

/** ویزارد خرید/فروش چهار مرحله‌ای با تأییدهای امنیتی */
export function TradeWizard() {
  const accounts = useAppStore((s) => s.accounts).filter((a) => a.visible);
  const markets = useAppStore((s) => s.markets);
  const persian = useAppStore((s) => s.settings.persianDigits);
  const highValueWarn = useAppStore((s) => s.settings.highValueWarningTMN);

  /* ---------- وضعیت مراحل ---------- */
  const [step, setStep] = useState(1);
  const [accountId, setAccountId] = useState<string>("");
  const [symbol, setSymbol] = useState("GLD_18C_750TMN");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");

  /* ---------- داده‌های وابسته ---------- */
  const [accBalances, setAccBalances] = useState<Balance[] | null>(null);
  const [balancesLoading, setBalancesLoading] = useState(false);

  const market: Market | undefined = markets.find((m) => m.symbol === symbol);
  const marketPrice = Number(market?.marketCap?.lastPrice ?? 0);
  const feeRate = Number(market?.otcFeeCoefficient ?? 0);

  /* ---------- مرحله ۲: قیمت خصوصی ---------- */
  const [priceInfo, setPriceInfo] = useState<WgPriceInfo | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  /* ---------- مرحله ۳: تأیید ---------- */
  const [checked, setChecked] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [countdown5, setCountdown5] = useState(5);

  /* ---------- مرحله ۴: ثبت ---------- */
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<WgOrderInfo | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitGuard = useRef(false);

  // انتخاب اولین حساب به‌طور پیش‌فرض
  useEffect(() => {
    if (!accountId && accounts.length > 0) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  /* ---------- موجودی حساب انتخابی ---------- */
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    setBalancesLoading(true);
    setAccBalances(null);
    api
      .getBalances(accountId)
      .then(({ results }) => {
        if (cancelled) return;
        const r = results[0];
        if (r?.ok) setAccBalances(r.balances);
        else if (r) toast.error(r.error ?? "دریافت موجودی حساب ناموفق بود");
      })
      .catch(() => {})
      .finally(() => !cancelled && setBalancesLoading(false));
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  const balanceOf = (currency: string) => {
    const b = accBalances?.find((x) => x.currency === currency);
    return { amount: Number(b?.amount ?? 0), locked: Number(b?.locked_amount ?? 0), free: Math.max(0, Number(b?.amount ?? 0) - Number(b?.locked_amount ?? 0)) };
  };

  /* ---------- اعتبارسنجی مرحله ۱ ---------- */
  const amountNum = Number(amount || 0);
  const validation = useMemo(() => {
    const errors: string[] = [];
    if (!market) return { ok: false, errors: ["اطلاعات بازار در دسترس نیست"], notional: 0, estFee: 0, estTotal: 0 };
    if (!amount || amountNum <= 0) {
      return { ok: false, errors: ["مقدار سفارش را وارد کنید"], notional: 0, estFee: 0, estTotal: 0 };
    }
    if (!/^\d+(\.\d{1,3})?$/.test(amount)) errors.push("مقدار باید عدد مثبت با حداکثر ۳ رقم اعشار باشد");
    if (amountNum < Number(market.minQty)) errors.push(`حداقل مقدار ${toPersianDigits(market.minQty)} گرم است`);
    if (amountNum > Number(market.maxQty)) errors.push(`حداکثر مقدار ${toPersianDigits(market.maxQty)} گرم است`);

    const sideEnabled = side === "buy" ? market.buyStatus === "enable" : market.sellStatus === "enable";
    if (!sideEnabled) errors.push(`بازار ${market.faBaseAsset} برای ${side === "buy" ? "خرید" : "فروش"} غیرفعال است`);

    const notional = amountNum * marketPrice;
    if (marketPrice > 0 && notional < Number(market.minNotional)) {
      errors.push(`ارزش کل سفارش باید حداقل ${fmtTMN(market.minNotional, persian)} باشد`);
    }

    const estFee = notional * feeRate;
    const estTotal = side === "buy" ? notional + estFee : notional - estFee;

    if (accBalances) {
      if (side === "buy") {
        const free = balanceOf("TMN").free;
        if (marketPrice > 0 && free < estTotal) {
          errors.push(`موجودی تومان کافی نیست (آزاد: ${fmtTMN(free, persian)})`);
        }
      } else {
        const free = balanceOf(market.baseAsset).free;
        if (free < amountNum) {
          errors.push(`موجودی آزاد ${market.faBaseAsset} کافی نیست (آزاد: ${fmtGram(free, persian)})`);
        }
      }
    }

    return { ok: errors.length === 0, errors, notional, estFee, estTotal };
     
  }, [amount, amountNum, market, side, marketPrice, feeRate, accBalances, persian]);

  /* ---------- مرحله ۲: دریافت قیمت ---------- */
  const fetchPrice = async () => {
    if (!accountId || priceLoading) return;
    setPriceLoading(true);
    setPriceError(null);
    setPriceInfo(null);
    try {
      const { price, serverNow } = await api.getPrice(accountId, symbol, side);
      setPriceInfo(price);
      setClockOffset(new Date(serverNow).getTime() - Date.now());
    } catch (e) {
      setPriceError(e instanceof ApiError ? e.message : "دریافت قیمت ناموفق بود");
    } finally {
      setPriceLoading(false);
    }
  };

  // با ورود به مرحله ۲، قیمت خودکار دریافت می‌شود
  useEffect(() => {
    if (step === 2) {
      setPriceInfo(null);
      setPriceError(null);
      fetchPrice();
    }
     
  }, [step]);

  // با ورود به مرحله ۳، شمارش معکوس ۵ ثانیه‌ای دکمه تأیید
  useEffect(() => {
    if (step === 3) {
      setChecked(false);
      setPhrase("");
      setCountdown5(5);
      const id = setInterval(() => {
        setCountdown5((c) => (c <= 1 ? 0 : c - 1));
      }, 1000);
      return () => clearInterval(id);
    }
  }, [step]);

  /* ---------- شمارش معکوس TTL ---------- */
  const [ttlRemaining, setTtlRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!priceInfo) {
      setTtlRemaining(null);
      return;
    }
    const expires = new Date(priceInfo.priceExpiresAt).getTime();
    const tick = () => {
      const now = Date.now() + clockOffset;
      setTtlRemaining(Math.max(0, (expires - now) / 1000));
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [priceInfo, clockOffset]);

  const priceExpired = priceInfo !== null && ttlRemaining !== null && ttlRemaining <= 0;
  const exactPrice = Number(priceInfo?.price ?? 0);

  /* ---------- مرحله ۴: ثبت سفارش ---------- */
  const submitOrder = async () => {
    if (submitGuard.current || submitting) return; // جلوگیری از درخواست همزمان
    if (priceExpired || !priceInfo) {
      toast.error("اعتبار قیمت به پایان رسیده است؛ قیمت جدید دریافت کنید");
      setStep(2);
      return;
    }
    submitGuard.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { order } = await api.createOrder({ accountId, symbol, side, orderAmount: amount });
      setResult(order);
      toast.success(`سفارش با موفقیت ثبت شد (شناسه: ${order.orderId})`);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      setSubmitError(err?.message ?? "ثبت سفارش ناموفق بود");
      // خطای قیمت → بازگشت به مرحله ۲
      if (err?.errorCode === "INVALID_PRICE") {
        toast.error("قیمت منقضی شده است. برای دریافت قیمت جدید به مرحله ۲ بازمی‌گردید.");
        setTimeout(() => setStep(2), 1500);
      }
    } finally {
      setSubmitting(false);
      submitGuard.current = false;
    }
  };

  /* ---------- پیگیری سفارش pending ---------- */
  const [tracking, setTracking] = useState(false);
  const trackOrder = async () => {
    if (!result || tracking) return;
    setTracking(true);
    try {
      const { order } = await api.getOrder(accountId, result.orderId);
      setResult(order);
      toast.success(`وضعیت سفارش: ${orderStatusLabel(order.status)}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "پیگیری ناموفق بود");
    } finally {
      setTracking(false);
    }
  };

  /* ---------- محاسبات نمایشی ---------- */
  const finalNotional = step >= 2 && exactPrice > 0 ? amountNum * exactPrice : validation.notional;
  const finalFee = step >= 2 && exactPrice > 0 ? finalNotional * feeRate : validation.estFee;
  const finalTotal = side === "buy" ? finalNotional + finalFee : finalNotional - finalFee;
  const isHighValue = finalTotal >= highValueWarn && highValueWarn > 0;

  const restart = () => {
    setStep(1);
    setAmount("");
    setResult(null);
    setSubmitError(null);
    setPriceInfo(null);
  };

  const accountName = accounts.find((a) => a.id === accountId)?.name ?? "—";

  return (
    <div className="max-w-2xl mx-auto">
      {/* ---------- استپر ---------- */}
      <ol className="flex items-center gap-1 mb-6" aria-label="مراحل سفارش">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n || (n === 4 && result);
          return (
            <li key={n} className="flex-1 flex items-center gap-1 min-w-0">
              <div
                className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold shrink-0 transition-colors",
                  done
                    ? "bg-buy text-buy-foreground"
                    : active
                      ? "bg-gold text-gold-foreground"
                      : "bg-muted text-muted-foreground"
                )}
                aria-current={active ? "step" : undefined}
              >
                {done ? <CheckCircle2 className="w-4.5 h-4.5" aria-hidden="true" /> : toPersianDigits(String(n))}
              </div>
              <span
                className={cn(
                  "text-[11px] hidden sm:block truncate",
                  active ? "text-foreground font-medium" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
              {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border min-w-2" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>

      {/* ---------- مرحله ۱ ---------- */}
      {step === 1 && (
        <Card>
          <CardContent className="p-5 sm:p-6 space-y-5">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-gold" aria-hidden="true" />
              انتخاب پارامترهای سفارش
            </h2>

            {/* حساب */}
            <div className="space-y-2">
              <Label htmlFor="trade-account">حساب معاملاتی</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="trade-account" className="w-full">
                  <SelectValue placeholder="حساب را انتخاب کنید" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {balancesLoading && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                  در حال دریافت موجودی...
                </p>
              )}
            </div>

            {/* بازار */}
            <div className="space-y-2">
              <Label>بازار</Label>
              <div className="grid grid-cols-2 gap-3">
                {markets.map((m) => {
                  const selected = symbol === m.symbol;
                  const isGold = m.symbol === "GLD_18C_750TMN";
                  return (
                    <button
                      key={m.symbol}
                      type="button"
                      onClick={() => setSymbol(m.symbol)}
                      aria-pressed={selected}
                      className={cn(
                        "flex items-center gap-3 p-4 rounded-xl border text-start transition-all",
                        selected
                          ? "border-gold/60 bg-gold/10"
                          : "border-border hover:border-gold/30 hover:bg-muted/50"
                      )}
                    >
                      <div
                        className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                          isGold ? "bg-gold/15 text-gold" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {isGold ? <Coins className="w-5 h-5" aria-hidden="true" /> : <Sparkles className="w-5 h-5" aria-hidden="true" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm">{m.faBaseAsset}</p>
                        <p className="text-[11px] text-muted-foreground" dir="ltr">
                          {fmtTMN(m.marketCap?.lastPrice ?? "0", persian, false)}
                        </p>
                      </div>
                    </button>
                  );
                })}
                {markets.length === 0 && (
                  <div className="col-span-2 space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                )}
              </div>
            </div>

            {/* سمت معامله */}
            <div className="space-y-2">
              <Label>سمت معامله</Label>
              <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="سمت معامله">
                <button
                  type="button"
                  role="radio"
                  aria-checked={side === "buy"}
                  onClick={() => setSide("buy")}
                  disabled={market ? market.buyStatus !== "enable" : false}
                  className={cn(
                    "flex items-center justify-center gap-2 py-3.5 rounded-xl border font-bold transition-all",
                    side === "buy"
                      ? "border-buy/60 bg-buy/15 text-buy"
                      : "border-border hover:border-buy/40",
                    market && market.buyStatus !== "enable" && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <ArrowLeftRight className="w-4.5 h-4.5" aria-hidden="true" />
                  خرید
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={side === "sell"}
                  onClick={() => setSide("sell")}
                  disabled={market ? market.sellStatus !== "enable" : false}
                  className={cn(
                    "flex items-center justify-center gap-2 py-3.5 rounded-xl border font-bold transition-all",
                    side === "sell"
                      ? "border-sell/60 bg-sell/15 text-sell"
                      : "border-border hover:border-sell/40",
                    market && market.sellStatus !== "enable" && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <ArrowLeftRight className="w-4.5 h-4.5 rotate-180" aria-hidden="true" />
                  فروش
                </button>
              </div>
            </div>

            {/* مقدار */}
            <div className="space-y-2">
              <Label htmlFor="trade-amount">مقدار (گرم)</Label>
              <Input
                id="trade-amount"
                dir="ltr"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(normalizeAmount(e.target.value))}
                placeholder="0.000"
                className="text-lg font-bold text-center"
                aria-describedby="trade-amount-help"
                autoComplete="off"
              />
              <p id="trade-amount-help" className="text-[11px] text-muted-foreground">
                حداکثر ۳ رقم اعشار — حداقل {toPersianDigits(market?.minQty ?? "—")} و حداکثر{" "}
                {toPersianDigits(market?.maxQty ?? "—")} گرم
              </p>
              {accBalances && market && (
                <div className="flex items-center justify-between text-xs bg-muted/50 rounded-lg px-3 py-2">
                  <span className="text-muted-foreground">
                    {side === "buy" ? "موجودی تومان آزاد" : `موجودی آزاد ${market.faBaseAsset}`}
                  </span>
                  <span className="font-bold" dir="ltr">
                    {side === "buy"
                      ? fmtTMN(balanceOf("TMN").free, persian, false)
                      : fmtGram(balanceOf(market.baseAsset).free, persian, false)}
                  </span>
                </div>
              )}
            </div>

            {/* خلاصه برآوردی */}
            {amountNum > 0 && market && (
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-2 text-sm">
                <Row label="قیمت لحظه‌ای بازار (تومان/گرم)" value={fmtTMN(marketPrice, persian)} />
                <Row label="ارزش سفارش (برآوردی)" value={fmtTMN(validation.notional, persian)} />
                <Row label={`کارمزد تقریبی (${(feeRate * 100).toFixed(1)}%)`} value={fmtTMN(validation.estFee, persian)} />
                <div className="pt-2 border-t border-border/60">
                  <Row
                    label={side === "buy" ? "هزینه کل تقریبی" : "درآمد خالص تقریبی"}
                    value={fmtTMN(validation.estTotal, persian)}
                    bold
                    highlight
                  />
                </div>
              </div>
            )}

            {/* خطاهای اعتبارسنجی */}
            {validation.errors.length > 0 && amount && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 space-y-1.5" role="alert">
                {validation.errors.map((err, i) => (
                  <p key={i} className="text-sm text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    {err}
                  </p>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-[11px] text-muted-foreground flex items-start gap-1.5 leading-5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                قیمت دقیق و اعتبار ۳۰ ثانیه‌ای آن در مرحله بعد دریافت می‌شود.
              </p>
              <Button
                onClick={() => setStep(2)}
                disabled={!validation.ok || !accountId}
                size="lg"
              >
                مرحله بعد
                <ArrowRight className="w-4 h-4 ms-1 rotate-180" aria-hidden="true" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- مرحله ۲ ---------- */}
      {step === 2 && (
        <Card>
          <CardContent className="p-5 sm:p-6 space-y-5">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Timer className="w-5 h-5 text-gold" aria-hidden="true" />
              دریافت قیمت معتبر
            </h2>

            <p className="text-sm text-muted-foreground leading-7">
              قیمت زیر مستقیماً از API وال‌گلد برای حساب «{accountName}»، بازار {market?.faBaseAsset} و سمت{" "}
              {side === "buy" ? "خرید" : "فروش"} دریافت شده است. این قیمت فقط تا پایان شمارش معکوس معتبر است و
              سفارش باید پیش از انقضا ثبت شود.
            </p>

            {/* قیمت و شمارش معکوس */}
            {priceLoading && (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
              </div>
            )}

            {priceError && !priceLoading && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 flex items-center justify-between gap-3" role="alert">
                <p className="text-sm text-destructive flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {priceError}
                </p>
                <Button variant="outline" size="sm" onClick={fetchPrice}>
                  <RefreshCw className="w-3.5 h-3.5 me-1" aria-hidden="true" />
                  تلاش مجدد
                </Button>
              </div>
            )}

            {priceInfo && !priceLoading && (
              <>
                <div
                  className={cn(
                    "rounded-2xl border p-5 text-center transition-colors",
                    priceExpired ? "border-destructive/40 bg-destructive/10" : "border-gold/40 bg-gold/5"
                  )}
                >
                  <p className="text-xs text-muted-foreground mb-2">قیمت هر گرم (تومان)</p>
                  <p className="text-4xl font-bold tracking-tight" dir="ltr">
                    {fmtTMN(exactPrice, persian, false)}
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-2">
                    {priceExpired ? (
                      <Badge variant="destructive" className="gap-1.5">
                        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        اعتبار قیمت به پایان رسید
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1.5 text-gold border border-gold/30">
                        <Timer className="w-3.5 h-3.5" aria-hidden="true" />
                        اعتبار: <span dir="ltr" className="font-mono">{fmtCountdown(ttlRemaining ?? 0, persian)}</span>
                      </Badge>
                    )}
                  </div>
                </div>

                {/* خلاصه سفارش با قیمت دقیق */}
                <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-2 text-sm">
                  <Row label="حساب" value={accountName} />
                  <Row label="بازار" value={market?.faBaseAsset ?? symbol} />
                  <Row label="سمت" value={side === "buy" ? "خرید" : "فروش"} />
                  <Row label="مقدار" value={fmtGram(amountNum, persian)} />
                  <Row label="قیمت دقیق (تومان/گرم)" value={fmtTMN(exactPrice, persian, false)} />
                  <Row label="ارزش سفارش" value={fmtTMN(finalNotional, persian)} />
                  <Row label={`کارمزد (${(feeRate * 100).toFixed(1)}%)`} value={fmtTMN(finalFee, persian)} />
                  <div className="pt-2 border-t border-border/60">
                    <Row
                      label={side === "buy" ? "هزینه کل" : "درآمد خالص"}
                      value={fmtTMN(finalTotal, persian)}
                      bold
                      highlight
                    />
                  </div>
                </div>
              </>
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(1)} size="lg">
                <ChevronsLeft className="w-4 h-4 me-1" aria-hidden="true" />
                بازگشت و ویرایش
              </Button>
              <div className="flex items-center gap-2">
                {priceInfo && (
                  <Button variant="outline" onClick={fetchPrice} disabled={priceLoading}>
                    <RefreshCw className={cn("w-4 h-4 me-1", priceLoading && "animate-spin")} aria-hidden="true" />
                    قیمت جدید
                  </Button>
                )}
                <Button
                  onClick={() => setStep(3)}
                  disabled={!priceInfo || priceExpired}
                  size="lg"
                >
                  ادامه و تأیید نهایی
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- مرحله ۳ ---------- */}
      {step === 3 && priceInfo && (
        <Card className="border-sell/30">
          <CardContent className="p-5 sm:p-6 space-y-5">
            <h2 className="font-bold text-lg flex items-center gap-2 text-sell">
              <ShieldAlert className="w-5 h-5" aria-hidden="true" />
              تأیید نهایی سفارش
            </h2>

            {/* خلاصه نهایی */}
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-2 text-sm">
              <Row label="حساب" value={accountName} bold />
              <Row label="بازار" value={market?.faBaseAsset ?? symbol} />
              <Row
                label="سمت"
                value={side === "buy" ? "خرید" : "فروش"}
                bold
                valueClass={side === "buy" ? "text-buy" : "text-sell"}
              />
              <Row label="مقدار" value={fmtGram(amountNum, persian)} bold />
              <Row label="قیمت هر گرم" value={fmtTMN(exactPrice, persian)} />
              <Row label="ارزش سفارش" value={fmtTMN(finalNotional, persian)} />
              <Row label={`کارمزد (${(feeRate * 100).toFixed(1)}%)`} value={fmtTMN(finalFee, persian)} />
              <div className="pt-2 border-t border-border/60">
                <Row
                  label={side === "buy" ? "هزینه کل قابل پرداخت" : "درآمد خالص دریافتی"}
                  value={fmtTMN(finalTotal, persian)}
                  bold
                  highlight
                />
              </div>
              <Row label="اعتبار قیمت" value={priceExpired ? "منقضی شده!" : fmtCountdown(ttlRemaining ?? 0, persian)} valueClass={priceExpired ? "text-destructive" : ""} />
            </div>

            {/* هشدار مبلغ بالا */}
            {isHighValue && (
              <div
                className="rounded-xl border border-sell/40 bg-sell/10 p-4 flex items-start gap-3"
                role="alert"
              >
                <AlertTriangle className="w-5 h-5 text-sell shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-sm leading-6 text-sell">
                  هشدار: ارزش این سفارش ({fmtTMN(finalTotal, persian)}) بالای آستانه هشدار شما است. لطفاً از
                  صحت پارامترها اطمینان حاصل کنید.
                </p>
              </div>
            )}

            {/* تأییدهای امنیتی */}
            <div className="space-y-4 rounded-xl border border-border/60 p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="confirm-checkbox"
                  checked={checked}
                  onCheckedChange={(v) => setChecked(v === true)}
                  className="mt-1"
                  aria-describedby="confirm-checkbox-label"
                />
                <label htmlFor="confirm-checkbox" className="text-sm leading-6 cursor-pointer" id="confirm-checkbox-label">
                  من متوجه هستم که این سفارش <b>قابل برگشت نیست</b> و مسئولیت کامل مالی آن را می‌پذیرم.
                </label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-phrase">
                  برای تأیید، عبارت «{CONFIRM_PHRASE}» را دقیقاً وارد کنید
                </Label>
                <Input
                  id="confirm-phrase"
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  placeholder={CONFIRM_PHRASE}
                  className="text-center"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setStep(2)}
                size="lg"
                disabled={submitting}
              >
                <ChevronsLeft className="w-4 h-4 me-1" aria-hidden="true" />
                بازگشت
              </Button>

              <Button
                variant="destructive"
                size="lg"
                onClick={submitOrder}
                disabled={
                  !checked ||
                  phrase.trim() !== CONFIRM_PHRASE ||
                  countdown5 > 0 ||
                  submitting ||
                  priceExpired
                }
                className="min-w-44"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4.5 h-4.5 animate-spin" aria-hidden="true" />
                    در حال ثبت سفارش...
                  </>
                ) : countdown5 > 0 ? (
                  `فعال‌سازی دکمه تا ${toPersianDigits(String(countdown5))} ثانیه...`
                ) : priceExpired ? (
                  "قیمت منقضی شده — بازگشت"
                ) : (
                  <>
                    <ShieldCheck className="w-4.5 h-4.5 me-1" aria-hidden="true" />
                    ثبت نهایی سفارش
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- مرحله ۴ ---------- */}
      {step === 4 && (
        <Card>
          <CardContent className="p-5 sm:p-6 space-y-5">
            {submitting && (
              <div className="text-center py-8 space-y-4">
                <Loader2 className="w-12 h-12 text-gold animate-spin mx-auto" aria-hidden="true" />
                <p className="font-medium">در حال ثبت سفارش در وال‌گلد...</p>
                <p className="text-xs text-muted-foreground">لطفاً صفحه را نبندید و دوباره ارسال نکنید.</p>
              </div>
            )}

            {submitError && !submitting && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-5 space-y-4" role="alert">
                <p className="font-bold text-destructive flex items-center gap-2">
                  <XCircle className="w-5 h-5" aria-hidden="true" />
                  ثبت سفارش ناموفق بود
                </p>
                <p className="text-sm leading-6">{submitError}</p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    <RefreshCw className="w-4 h-4 me-1" aria-hidden="true" />
                    دریافت قیمت جدید و تلاش مجدد
                  </Button>
                  <Button variant="outline" onClick={restart}>
                    شروع مجدد
                  </Button>
                </div>
              </div>
            )}

            {result && (
              <>
                <div className="text-center space-y-2 py-2">
                  <CheckCircle2 className="w-14 h-14 text-buy mx-auto" aria-hidden="true" />
                  <h2 className="font-bold text-lg">سفارش با موفقیت ثبت شد</h2>
                  <p className="text-sm text-muted-foreground">
                    شناسه سفارش: <span className="font-mono font-bold" dir="ltr">{toPersianDigits(result.orderId)}</span>
                  </p>
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-2 text-sm">
                  <Row label="حساب" value={accountName} />
                  <Row label="بازار" value={market?.faBaseAsset ?? result.market} />
                  <Row
                    label="سمت"
                    value={result.side === "buy" ? "خرید" : "فروش"}
                    valueClass={result.side === "buy" ? "text-buy" : "text-sell"}
                  />
                  <Row label="مقدار سفارش" value={fmtGram(result.amount, persian)} />
                  <Row label="مقدار تکمیل‌شده" value={fmtGram(result.filledAmount, persian)} />
                  <Row label="قیمت هر گرم" value={fmtTMN(result.price, persian)} />
                  <Row label="ارزش کل سفارش" value={fmtTMN(result.totalPrice, persian)} bold />
                  <Row label="کارمزد معامله" value={fmtTMN(result.otcFee, persian)} />
                  <Row
                    label="وضعیت"
                    value={orderStatusLabel(result.status)}
                    bold
                    valueClass={result.status === "finished" ? "text-buy" : result.status === "pending" ? "text-gold" : "text-muted-foreground"}
                  />
                  <Row label="زمان ثبت" value={fmtDateTime(result.createdAt, persian)} />
                  <Row label="شناسه یکتا (clientId)" value={result.clientId} mono />
                </div>

                <div className="flex flex-wrap items-center gap-2 justify-center pt-2">
                  {result.status !== "finished" && (
                    <Button variant="outline" onClick={trackOrder} disabled={tracking}>
                      {tracking ? (
                        <Loader2 className="w-4 h-4 me-1 animate-spin" aria-hidden="true" />
                      ) : (
                        <RefreshCw className="w-4 h-4 me-1" aria-hidden="true" />
                      )}
                      پیگیری وضعیت
                    </Button>
                  )}
                  <Button onClick={restart}>
                    <KeyRound className="w-4 h-4 me-1" aria-hidden="true" />
                    سفارش جدید
                  </Button>
                </div>
              </>
            )}

            {!result && !submitError && !submitting && <p className="text-center text-muted-foreground py-8">—</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  highlight,
  mono,
  valueClass,
}: {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
  mono?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span
        dir={mono ? "ltr" : "auto"}
        className={cn(
          "text-end",
          bold && "font-bold",
          highlight && "text-gold",
          mono && "font-mono text-xs",
          valueClass
        )}
      >
        {value}
      </span>
    </div>
  );
}
