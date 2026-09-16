"use client";

/**
 * نمای تنظیمات — سه تب مجزا برای کاهش شلوغی و دسترسی سریع:
 *   ۱) حساب‌ها: مدیریت حساب‌های وال‌گلد
 *   ۲) عمومی: ظاهر، اعداد، به‌روزرسانی، هشدارها و نصب PWA
 *   ۳) امنیت: داشبورد دفاع سایبری، 2FA، رمز، نشست‌ها و پاک‌سازی
 */

import { useState } from "react";
import { useAppStore } from "@/store/app-store";
import { api, ApiError, type PublicAccount } from "@/lib/client-api";
import { usePwaInstall } from "@/lib/pwa";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SecurityPanel } from "./security-panel";
import { AddAccountDialog } from "./add-account-dialog";
import {
  Settings as SettingsIcon,
  Users,
  SlidersHorizontal,
  ShieldCheck,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  PlugZap,
  CircleCheck,
  CircleAlert,
  Moon,
  Sun,
  AlertTriangle,
  MonitorSmartphone,
  Share,
  CirclePlus,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type SettingsTab = "accounts" | "general" | "security";

const TABS: { key: SettingsTab; label: string; icon: typeof Users }[] = [
  { key: "accounts", label: "حساب‌ها", icon: Users },
  { key: "general", label: "عمومی", icon: SlidersHorizontal },
  { key: "security", label: "امنیت", icon: ShieldCheck },
];

/** نمای تنظیمات */
export function SettingsView() {
  const [tab, setTab] = useState<SettingsTab>("accounts");

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <h2 className="font-bold text-lg flex items-center gap-2">
        <SettingsIcon className="w-5 h-5 text-gold" aria-hidden="true" />
        تنظیمات
      </h2>

      {/* نوار تب‌ها — روی موبایل قابل اسکرول افقی */}
      <div
        className="flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border/60 overflow-x-auto no-scrollbar"
        role="tablist"
        aria-label="بخش‌های تنظیمات"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 px-4 h-10 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0",
              tab === t.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="w-4 h-4" aria-hidden="true" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "accounts" && <AccountsSection />}
      {tab === "general" && <GeneralSection />}
      {tab === "security" && <SecurityPanel />}
    </div>
  );
}

/* ------------------------------ مدیریت حساب‌ها ------------------------------ */

function AccountsSection() {
  const accounts = useAppStore((s) => s.accounts);
  const setAccounts = useAppStore((s) => s.setAccounts);

  const [editing, setEditing] = useState<PublicAccount | null>(null);
  const [editName, setEditName] = useState("");
  const [deleting, setDeleting] = useState<PublicAccount | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const reload = async () => {
    const { accounts } = await api.getAccounts();
    setAccounts(accounts);
  };

  const saveEdit = async () => {
    if (!editing || !editName.trim()) return;
    try {
      await api.updateAccount(editing.id, { name: editName.trim() });
      await reload();
      setEditing(null);
      toast.success("نام حساب به‌روزرسانی شد");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "به‌روزرسانی ناموفق بود");
    }
  };

  const toggleVisible = async (acc: PublicAccount) => {
    try {
      await api.updateAccount(acc.id, { visible: !acc.visible });
      await reload();
      toast.success(acc.visible ? `حساب «${acc.name}» از داشبورد پنهان شد` : `حساب «${acc.name}» در داشبورد نمایش داده می‌شود`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "تغییر وضعیت نمایش ناموفق بود");
    }
  };

  const testConnection = async (acc: PublicAccount) => {
    setTesting(acc.id);
    try {
      const { message } = await api.testAccount(acc.id);
      await reload();
      toast.success(`${acc.name}: ${message}`);
    } catch (e) {
      await reload();
      toast.error(`${acc.name}: ${e instanceof ApiError ? e.message : "تست اتصال ناموفق بود"}`);
    } finally {
      setTesting(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await api.deleteAccount(deleting.id);
      await reload();
      toast.success(`حساب «${deleting.name}» حذف شد`);
      setDeleting(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "حذف ناموفق بود");
    }
  };

  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-bold flex items-center gap-2">
            <Users className="w-4.5 h-4.5 text-gold" aria-hidden="true" />
            مدیریت حساب‌ها
          </h3>
          <AddAccountDialog />
        </div>

        {accounts.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6 leading-7">
            هنوز حسابی اضافه نشده است.
            <br />
            با دکمه «افزودن حساب»، اولین حساب وال‌گلد خود را با توکن API ثبت کنید.
          </p>
        )}

        <div className="space-y-3">
          {accounts.map((acc) => (
            <div key={acc.id} className="rounded-xl border border-border/60 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {acc.lastCheckOk === true && <CircleCheck className="w-4 h-4 text-buy shrink-0" aria-label="اتصال سالم" />}
                  {acc.lastCheckOk === false && <CircleAlert className="w-4 h-4 text-destructive shrink-0" aria-label="خطای اتصال" />}
                  {acc.lastCheckOk === null && <CircleAlert className="w-4 h-4 text-muted-foreground shrink-0" aria-label="تست نشده" />}
                  <span className="font-bold truncate">{acc.name}</span>
                  {!acc.visible && (
                    <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                      <EyeOff className="w-3 h-3" aria-hidden="true" />
                      پنهان
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => toggleVisible(acc)}
                    title={acc.visible ? "پنهان از داشبورد" : "نمایش در داشبورد"}
                    aria-label={acc.visible ? `پنهان کردن ${acc.name}` : `نمایش ${acc.name}`}
                  >
                    {acc.visible ? <Eye className="w-4 h-4" aria-hidden="true" /> : <EyeOff className="w-4 h-4" aria-hidden="true" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => {
                      setEditing(acc);
                      setEditName(acc.name);
                    }}
                    title="ویرایش نام"
                    aria-label={`ویرایش نام ${acc.name}`}
                  >
                    <Pencil className="w-4 h-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive hover:text-destructive"
                    onClick={() => setDeleting(acc)}
                    title="حذف حساب"
                    aria-label={`حذف ${acc.name}`}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              {acc.lastCheckMsg && (
                <p className={cn("text-[11px] leading-5", acc.lastCheckOk ? "text-muted-foreground" : "text-destructive")}>
                  {acc.lastCheckMsg}
                </p>
              )}

              <div className="flex items-center justify-between gap-2">
                <Button variant="outline" size="sm" onClick={() => testConnection(acc)} disabled={testing === acc.id}>
                  {testing === acc.id ? (
                    <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" aria-hidden="true" />
                  ) : (
                    <PlugZap className="w-3.5 h-3.5 me-1" aria-hidden="true" />
                  )}
                  تست اتصال
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      {/* ویرایش نام */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>ویرایش نام حساب</DialogTitle>
            <DialogDescription>نام نمایشی این حساب را تغییر دهید.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-name">نام جدید</Label>
            <Input
              id="edit-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={60}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>انصراف</Button>
            <Button onClick={saveEdit} disabled={!editName.trim()}>ذخیره</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تأیید حذف */}
      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" aria-hidden="true" />
              حذف حساب «{deleting?.name}»
            </AlertDialogTitle>
            <AlertDialogDescription>
              توکن این حساب به‌صورت امن حذف می‌شود و تاریخچه سفارشات ردیابی‌شده آن نیز پاک خواهد شد. این عمل قابل
              برگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              حذف قطعی
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/* ------------------------------ تنظیمات عمومی ------------------------------ */

function GeneralSection() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const [saving, setSaving] = useState(false);
  const { canInstall, promptInstall, isStandalone, isIOS } = usePwaInstall();

  const save = async (data: Parameters<typeof api.saveSettings>[0]) => {
    setSaving(true);
    try {
      const { settings: newSettings } = await api.saveSettings(data);
      setSettings(newSettings);
      toast.success("تنظیمات ذخیره شد");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "ذخیره ناموفق بود");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-4 sm:p-5 space-y-5">
          <h3 className="font-bold flex items-center gap-2">
            <SlidersHorizontal className="w-4.5 h-4.5 text-gold" aria-hidden="true" />
            نمایش و ظاهر
          </h3>

          {/* تم */}
          <SettingRow
            label="تم اپلیکیشن"
            hint="حالت نمایش روشن یا تاریک"
          >
            <div className="flex items-center gap-1.5">
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setTheme("dark");
                  save({ defaultTheme: "dark" });
                }}
                className="gap-1.5 h-9"
                aria-pressed={theme === "dark"}
              >
                <Moon className="w-3.5 h-3.5" aria-hidden="true" />
                تاریک
              </Button>
              <Button
                variant={theme === "light" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setTheme("light");
                  save({ defaultTheme: "light" });
                }}
                className="gap-1.5 h-9"
                aria-pressed={theme === "light"}
              >
                <Sun className="w-3.5 h-3.5" aria-hidden="true" />
                روشن
              </Button>
            </div>
          </SettingRow>

          {/* فرمت اعداد */}
          <SettingRow
            label="ارقام فارسی"
            hint="نمایش اعداد با ارقام فارسی (۱۲۳) یا انگلیسی (123)"
            htmlFor="persian-digits"
          >
            <Switch
              id="persian-digits"
              checked={settings.persianDigits}
              onCheckedChange={(v) => save({ persianDigits: v })}
              disabled={saving}
            />
          </SettingRow>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 sm:p-5 space-y-5">
          <h3 className="font-bold flex items-center gap-2">
            <CircleCheck className="w-4.5 h-4.5 text-gold" aria-hidden="true" />
            داده‌ها و هشدارها
          </h3>

          {/* به‌روزرسانی بازارها */}
          <SettingRow label="به‌روزرسانی خودکار قیمت‌ها" hint="فاصله دریافت قیمت لحظه‌ای بازارها">
            <Select
              value={String(settings.marketsRefreshSeconds)}
              onValueChange={(v) => save({ marketsRefreshSeconds: Number(v) })}
              disabled={saving}
            >
              <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">۱۰ ثانیه</SelectItem>
                <SelectItem value="30">۳۰ ثانیه</SelectItem>
                <SelectItem value="60">۱ دقیقه</SelectItem>
                <SelectItem value="120">۲ دقیقه</SelectItem>
                <SelectItem value="0">غیرفعال</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>

          {/* به‌روزرسانی موجودی */}
          <SettingRow label="به‌روزرسانی خودکار موجودی" hint="فاصله دریافت موجودی حساب‌ها">
            <Select
              value={String(settings.balancesRefreshSeconds)}
              onValueChange={(v) => save({ balancesRefreshSeconds: Number(v) })}
              disabled={saving}
            >
              <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">۳۰ ثانیه</SelectItem>
                <SelectItem value="60">۱ دقیقه</SelectItem>
                <SelectItem value="120">۲ دقیقه</SelectItem>
                <SelectItem value="0">غیرفعال</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>

          {/* آستانه هشدار مبلغ بالا */}
          <SettingRow
            label="آستانه هشدار مبلغ بالا (تومان)"
            hint="سفارش‌های بالای این مبلغ هشدار ویژه نمایش می‌دهند"
            htmlFor="high-value"
          >
            <Input
              id="high-value"
              dir="ltr"
              inputMode="numeric"
              className="w-36 text-end h-9"
              defaultValue={String(settings.highValueWarningTMN)}
              onBlur={(e) => {
                const v = Number(e.target.value.replace(/[^0-9]/g, ""));
                if (Number.isFinite(v) && v !== settings.highValueWarningTMN) save({ highValueWarningTMN: v });
              }}
            />
          </SettingRow>
        </CardContent>
      </Card>

      {/* نصب اپلیکیشن (PWA) */}
      <Card>
        <CardContent className="p-4 sm:p-5 space-y-4">
          <h3 className="font-bold flex items-center gap-2">
            <MonitorSmartphone className="w-4.5 h-4.5 text-gold" aria-hidden="true" />
            نصب اپلیکیشن
          </h3>

          {isStandalone ? (
            <div className="flex items-start gap-3 rounded-xl border border-buy/30 bg-buy/5 p-3.5">
              <CircleCheck className="w-5 h-5 text-buy shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-sm leading-6">
                این دستگاه در حال حاضر از حالت <b>نصب‌شده</b> اجرا می‌شود — اپلیکیشن به‌صورت تمام‌صفحه و مستقل از
                مرورگر باز شده است.
              </p>
            </div>
          ) : canInstall ? (
            <>
              <p className="text-xs text-muted-foreground leading-6">
                اپلیکیشن مدیریت وال‌گلد را روی همین دستگاه نصب کنید تا مانند یک اپ واقعی، تمام‌صفحه و سریع‌تر باز شود و
                همیشه در دسترس باشد.
              </p>
              <Button onClick={promptInstall} className="gap-2">
                <MonitorSmartphone className="w-4 h-4" aria-hidden="true" />
                نصب روی این دستگاه
              </Button>
            </>
          ) : isIOS ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground leading-6">
                در مرورگر Safari سیستم عامل iOS:
              </p>
              <ol className="text-xs space-y-2 leading-6">
                <li className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center shrink-0 text-[11px] font-bold">۱</span>
                  روی دکمه اشتراک‌گذاری <Share className="w-3.5 h-3.5 inline text-gold" aria-hidden="true" /> در نوار پایین بزنید
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center shrink-0 text-[11px] font-bold">۲</span>
                  گزینه «Add to Home Screen» را انتخاب کنید
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center shrink-0 text-[11px] font-bold">۳</span>
                  روی «Add» بزنید — آیکون وال‌گلد به صفحه اصلی اضافه می‌شود
                </li>
              </ol>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/40 p-3.5">
              <CirclePlus className="w-5 h-5 text-gold shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-muted-foreground leading-6">
                برای نصب، در کروم دسکتاپ روی آیکون نصب <span className="font-mono" dir="ltr">(⊕)</span> در انتهای نوار
                آدرس کلیک کنید؛ در کروم اندروید از منوی سه‌نقطه گزینه «Add to Home screen / Install app» را انتخاب
                نمایید.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** ردیف تنظیمات — روی موبایل زیر هم، از تبلت به بالا کنار هم */
function SettingRow({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="min-w-0">
        <Label htmlFor={htmlFor}>{label}</Label>
        {hint && <p className="text-xs text-muted-foreground mt-1 leading-5">{hint}</p>}
      </div>
      <div className="shrink-0 self-start sm:self-auto">{children}</div>
    </div>
  );
}
