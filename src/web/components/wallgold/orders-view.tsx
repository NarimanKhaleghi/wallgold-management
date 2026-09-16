"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { api, ApiError, type TrackedOrder, type WgOrderInfo } from "@/lib/client-api";
import { fmtTMN, fmtGram, fmtDateTime, orderStatusLabel, toPersianDigits, symbolName } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  History as HistoryIcon,
  RefreshCw,
  Loader2,
  Plus,
  Trash2,
  ArrowLeftRight,
  CircleCheck,
  Timer,
  XCircle,
  Search,
  Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** نمای تاریخچه سفارشات: لیست، فیلترها و جزئیات */
export function OrdersView() {
  const accounts = useAppStore((s) => s.accounts);
  const persian = useAppStore((s) => s.settings.persianDigits);

  const [orders, setOrders] = useState<TrackedOrder[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /* فیلترها */
  const [fAccount, setFAccount] = useState("all");
  const [fMarket, setFMarket] = useState("all");
  const [fSide, setFSide] = useState("all");
  const [fStatus, setFStatus] = useState("all");

  /* جزئیات */
  const [detail, setDetail] = useState<{ order: WgOrderInfo; accountName: string } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  /* افزودن شناسه سفارش */
  const [addOpen, setAddOpen] = useState(false);
  const [addAccountId, setAddAccountId] = useState("");
  const [addOrderId, setAddOrderId] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const { orders } = await api.getHistory(refresh);
      setOrders(orders);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "دریافت تاریخچه ناموفق بود");
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!addAccountId && accounts.length > 0) setAddAccountId(accounts[0].id);
  }, [accounts, addAccountId]);

  const filtered = useMemo(() => {
    if (!orders) return [];
    return orders.filter((o) => {
      if (fAccount !== "all" && o.accountId !== fAccount) return false;
      const market = o.detail?.market;
      if (fMarket !== "all" && market !== fMarket) return false;
      const side = o.detail?.side;
      if (fSide !== "all" && side !== fSide) return false;
      const status = o.lastStatus ?? "";
      if (fStatus !== "all" && status !== fStatus) return false;
      return true;
    });
  }, [orders, fAccount, fMarket, fSide, fStatus]);

  const openDetail = async (o: TrackedOrder) => {
    setDetailLoading(true);
    try {
      // جزئیات تازه از API وال‌گلد
      const { order } = await api.getOrder(o.accountId, o.orderId);
      setDetail({ order, accountName: o.accountName });
      // به‌روزرسانی لیست محلی
      setOrders((prev) => prev?.map((p) => (p.id === o.id ? { ...p, detail: order, lastStatus: order.status } : p)) ?? null);
    } catch (e) {
      // نمایش جزئیات کش‌شده در صورت خطا
      if (o.detail) setDetail({ order: o.detail, accountName: o.accountName });
      toast.error(e instanceof ApiError ? e.message : "دریافت جزئیات ناموفق بود");
    } finally {
      setDetailLoading(false);
    }
  };

  const removeOrder = async (o: TrackedOrder) => {
    try {
      await api.deleteHistory(o.id);
      setOrders((prev) => prev?.filter((p) => p.id !== o.id) ?? null);
      toast.success("سفارش از تاریخچه حذف شد (بدون اثر بر سفارش واقعی)");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "حذف ناموفق بود");
    }
  };

  const trackNew = async () => {
    if (!addAccountId || !addOrderId.trim() || adding) return;
    setAdding(true);
    try {
      await api.trackOrder(addAccountId, addOrderId.trim());
      await load();
      setAddOpen(false);
      setAddOrderId("");
      toast.success("سفارش به تاریخچه اضافه شد");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "افزودن سفارش ناموفق بود");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* هدر */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-lg flex items-center gap-2">
          <HistoryIcon className="w-5 h-5 text-gold" aria-hidden="true" />
          تاریخچه سفارشات
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw className={cn("w-3.5 h-3.5 me-1", refreshing && "animate-spin")} aria-hidden="true" />
            به‌روزرسانی وضعیت‌ها
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="w-3.5 h-3.5 me-1" aria-hidden="true" />
            افزودن شناسه سفارش
          </Button>
        </div>
      </div>

      {/* فیلترها */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">حساب</Label>
              <Select value={fAccount} onValueChange={setFAccount}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه حساب‌ها</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">بازار</Label>
              <Select value={fMarket} onValueChange={setFMarket}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه بازارها</SelectItem>
                  <SelectItem value="GLD_18C_750TMN">طلا</SelectItem>
                  <SelectItem value="SLV_925TMN">نقره</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">سمت</Label>
              <Select value={fSide} onValueChange={setFSide}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">خرید و فروش</SelectItem>
                  <SelectItem value="buy">خرید</SelectItem>
                  <SelectItem value="sell">فروش</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">وضعیت</Label>
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                  <SelectItem value="finished">تکمیل‌شده</SelectItem>
                  <SelectItem value="pending">در انتظار</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* لیست سفارشات */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-5 w-full mb-3" />
              <Skeleton className="h-4 w-2/3" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Inbox className="w-12 h-12 text-muted-foreground/50 mx-auto" aria-hidden="true" />
            <p className="text-muted-foreground">
              {orders && orders.length > 0
                ? "سفارشی مطابق فیلترهای انتخابی وجود ندارد."
                : "هنوز سفارشی ثبت نشده است. سفارش‌های ثبت‌شده از طریق این اپلیکیشن به‌صورت خودکار اینجا نمایش داده می‌شوند."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => (
            <OrderRow key={o.id} order={o} persian={persian} onOpen={() => openDetail(o)} onDelete={() => removeOrder(o)} />
          ))}
        </div>
      )}

      {/* دیالوگ جزئیات */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          {detailLoading || !detail ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-gold" aria-label="در حال بارگذاری" />
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ArrowLeftRight className="w-5 h-5 text-gold" aria-hidden="true" />
                  جزئیات سفارش {toPersianDigits(detail.order.orderId)}
                </DialogTitle>
                <DialogDescription>
                  حساب «{detail.accountName}» — دریافت‌شده از API وال‌گلد
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2 text-sm max-h-[60vh] overflow-y-auto thin-scrollbar">
                <DRow label="بازار" value={symbolName(detail.order.market)} />
                <DRow
                  label="سمت"
                  value={detail.order.side === "buy" ? "خرید" : "فروش"}
                  valueClass={detail.order.side === "buy" ? "text-buy" : "text-sell"}
                />
                <DRow label="مقدار سفارش" value={fmtGram(detail.order.amount, persian)} />
                <DRow label="مقدار تکمیل‌شده" value={fmtGram(detail.order.filledAmount, persian)} />
                <DRow label="قیمت هر گرم" value={fmtTMN(detail.order.price, persian)} />
                <DRow label="ارزش کل" value={fmtTMN(detail.order.totalPrice, persian)} />
                <DRow label="کارمزد معامله" value={fmtTMN(detail.order.otcFee, persian)} />
                <DRow
                  label="وضعیت"
                  value={orderStatusLabel(detail.order.status)}
                  valueClass={
                    detail.order.status === "finished" ? "text-buy" : detail.order.status === "pending" ? "text-gold" : ""
                  }
                />
                <DRow label="زمان ثبت" value={fmtDateTime(detail.order.createdAt, persian)} />
                <DRow label="آخرین به‌روزرسانی" value={fmtDateTime(detail.order.updatedAt, persian)} />
                <DRow label="شناسه یکتا" value={detail.order.clientId} mono />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDetail(null)}>
                  بستن
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* دیالوگ افزودن شناسه سفارش */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="w-5 h-5 text-gold" aria-hidden="true" />
              افزودن سفارش موجود به تاریخچه
            </DialogTitle>
            <DialogDescription>
              اگر سفارشی خارج از این اپلیکیشن ثبت کرده‌اید، شناسه آن را وارد کنید تا وضعیت و جزئیاتش ردیابی شود.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>حساب مربوط به سفارش</Label>
              <Select value={addAccountId} onValueChange={setAddAccountId}>
                <SelectTrigger><SelectValue placeholder="حساب را انتخاب کنید" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-order-id">شناسه سفارش (orderId)</Label>
              <Input
                id="add-order-id"
                dir="ltr"
                value={addOrderId}
                onChange={(e) => setAddOrderId(e.target.value)}
                placeholder="مثال: 261"
                className="font-mono"
                autoComplete="off"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>
              انصراف
            </Button>
            <Button onClick={trackNew} disabled={adding || !addOrderId.trim() || !addAccountId}>
              {adding ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4 me-1" aria-hidden="true" />}
              افزودن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** ردیف سفارش در لیست */
function OrderRow({
  order,
  persian,
  onOpen,
  onDelete,
}: {
  order: TrackedOrder;
  persian: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const d = order.detail;
  const isBuy = d?.side === "buy";
  const status = order.lastStatus ?? "";

  return (
    <Card className="hover:border-gold/30 transition-colors">
      <CardContent className="p-4">
        <button
          onClick={onOpen}
          className="w-full text-start space-y-3"
          aria-label={`جزئیات سفارش ${order.orderId}`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={cn(
                  "shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full",
                  isBuy ? "bg-buy/15 text-buy" : "bg-sell/15 text-sell"
                )}
              >
                <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />
                {isBuy ? "خرید" : "فروش"}
              </span>
              <span className="text-sm font-bold truncate">
                {d ? symbolName(d.market) : "—"}
              </span>
            </div>
            <StatusBadge status={status} />
          </div>

          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div>
              <p className="text-muted-foreground mb-0.5">مقدار</p>
              <p className="font-bold" dir="ltr">{fmtGram(d?.amount ?? "0", persian, false)}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-0.5">قیمت (گرم)</p>
              <p className="font-bold" dir="ltr">{fmtTMN(d?.price ?? "0", persian, false)}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-0.5">ارزش کل</p>
              <p className="font-bold text-gold" dir="ltr">{fmtTMN(d?.totalPrice ?? "0", persian, false)}</p>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="truncate">
              {order.accountName} — {fmtDateTime(order.createdAt, persian)}
            </span>
            <span className="font-mono shrink-0" dir="ltr">
              #{toPersianDigits(order.orderId)}
            </span>
          </div>
        </button>

        <div className="flex justify-end pt-2 mt-2 border-t border-border/60">
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            title="حذف از تاریخچه"
            aria-label={`حذف سفارش ${order.orderId} از تاریخچه`}
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "finished") {
    return (
      <Badge className="gap-1 bg-buy/15 text-buy hover:bg-buy/15 border-0" variant="secondary">
        <CircleCheck className="w-3 h-3" aria-hidden="true" />
        تکمیل‌شده
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge variant="secondary" className="gap-1 text-gold border border-gold/30">
        <Timer className="w-3 h-3" aria-hidden="true" />
        در انتظار
      </Badge>
    );
  }
  if (status === "canceled" || status === "rejected") {
    return (
      <Badge variant="secondary" className="gap-1 bg-destructive/15 text-destructive border-0">
        <XCircle className="w-3 h-3" aria-hidden="true" />
        {orderStatusLabel(status)}
      </Badge>
    );
  }
  return <Badge variant="secondary" className="gap-1">{orderStatusLabel(status)}</Badge>;
}

function DRow({
  label,
  value,
  mono,
  valueClass,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span dir={mono ? "ltr" : "auto"} className={cn("text-end", mono && "font-mono text-xs", valueClass)}>
        {value}
      </span>
    </div>
  );
}
