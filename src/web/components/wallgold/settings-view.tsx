"use client";

/**
 * نمای تنظیمات: مدیریت حساب‌ها + تنظیمات عمومی + امنیت (رمز، 2FA، نشست‌ها، پاک‌سازی)
 */

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { api, ApiError, type PublicAccount } from "@/lib/client-api";
import { qrDataUrl } from "@/lib/qr";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { AddAccountDialog } from "./add-account-dialog";
import {
  Settings as SettingsIcon,
  Users,
  SlidersHorizontal,
  ShieldCheck,
  Loader2,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  PlugZap,
  CircleCheck,
  CircleAlert,
  Moon,
  Sun,
  Trash,
  AlertTriangle,
  KeyRound,
  Smartphone,
  Copy,
  Download,
  Check,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** نمای تنظیمات */
export function SettingsView() {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <h2 className="font-bold text-lg flex items-center gap-2">
        <SettingsIcon className="w-5 h-5 text-gold" aria-hidden="true" />
        تنظیمات
      </h2>
      <AccountsSection />
      <GeneralSection />
      <SecuritySection />
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
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-bold flex items-center gap-2">
            <Users className="w-4.5 h-4.5 text-gold" aria-hidden="true" />
            مدیریت حساب‌ها
          </h3>
          <AddAccountDialog />
        </div>

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
                    className="h-8 w-8"
                    onClick={() => toggleVisible(acc)}
                    title={acc.visible ? "پنهان از داشبورد" : "نمایش در داشبورد"}
                    aria-label={acc.visible ? `پنهان کردن ${acc.name}` : `نمایش ${acc.name}`}
                  >
                    {acc.visible ? <Eye className="w-4 h-4" aria-hidden="true" /> : <EyeOff className="w-4 h-4" aria-hidden="true" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
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
                    className="h-8 w-8 text-destructive hover:text-destructive"
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
    <Card>
      <CardContent className="p-5 space-y-5">
        <h3 className="font-bold flex items-center gap-2">
          <SlidersHorizontal className="w-4.5 h-4.5 text-gold" aria-hidden="true" />
          تنظیمات عمومی
        </h3>

        {/* تم */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>تم اپلیکیشن</Label>
            <p className="text-xs text-muted-foreground mt-1">حالت نمایش روشن یا تاریک</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant={theme === "dark" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setTheme("dark");
                save({ defaultTheme: "dark" });
              }}
              className="gap-1.5"
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
              className="gap-1.5"
            >
              <Sun className="w-3.5 h-3.5" aria-hidden="true" />
              روشن
            </Button>
          </div>
        </div>

        {/* فرمت اعداد */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="persian-digits">ارقام فارسی</Label>
            <p className="text-xs text-muted-foreground mt-1">نمایش اعداد با ارقام فارسی (۱۲۳) یا انگلیسی (123)</p>
          </div>
          <Switch
            id="persian-digits"
            checked={settings.persianDigits}
            onCheckedChange={(v) => save({ persianDigits: v })}
            disabled={saving}
          />
        </div>

        {/* به‌روزرسانی بازارها */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>به‌روزرسانی خودکار قیمت‌ها</Label>
            <p className="text-xs text-muted-foreground mt-1">فاصله دریافت قیمت لحظه‌ای بازارها</p>
          </div>
          <Select
            value={String(settings.marketsRefreshSeconds)}
            onValueChange={(v) => save({ marketsRefreshSeconds: Number(v) })}
            disabled={saving}
          >
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="10">۱۰ ثانیه</SelectItem>
              <SelectItem value="30">۳۰ ثانیه</SelectItem>
              <SelectItem value="60">۱ دقیقه</SelectItem>
              <SelectItem value="120">۲ دقیقه</SelectItem>
              <SelectItem value="0">غیرفعال</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* به‌روزرسانی موجودی */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>به‌روزرسانی خودکار موجودی</Label>
            <p className="text-xs text-muted-foreground mt-1">فاصله دریافت موجودی حساب‌ها</p>
          </div>
          <Select
            value={String(settings.balancesRefreshSeconds)}
            onValueChange={(v) => save({ balancesRefreshSeconds: Number(v) })}
            disabled={saving}
          >
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">۳۰ ثانیه</SelectItem>
              <SelectItem value="60">۱ دقیقه</SelectItem>
              <SelectItem value="120">۲ دقیقه</SelectItem>
              <SelectItem value="0">غیرفعال</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* آستانه هشدار مبلغ بالا */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="high-value">آستانه هشدار مبلغ بالا (تومان)</Label>
            <p className="text-xs text-muted-foreground mt-1">سفارش‌های بالای این مبلغ هشدار ویژه نمایش می‌دهند</p>
          </div>
          <Input
            id="high-value"
            dir="ltr"
            inputMode="numeric"
            className="w-36 text-end"
            defaultValue={String(settings.highValueWarningTMN)}
            onBlur={(e) => {
              const v = Number(e.target.value.replace(/[^0-9]/g, ""));
              if (Number.isFinite(v) && v !== settings.highValueWarningTMN) save({ highValueWarningTMN: v });
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------- بخش امنیت -------------------------------- */

function SecuritySection() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);

  const [has2fa, setHas2fa] = useState<boolean | null>(null);
  const [activeSessions, setActiveSessions] = useState<number | null>(null);

  /* تغییر رمز */
  const [current, setCurrent] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passTotp, setPassTotp] = useState("");
  const [passBusy, setPassBusy] = useState(false);

  /* 2FA */
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollSecret, setEnrollSecret] = useState("");
  const [enrollQr, setEnrollQr] = useState<string | null>(null);
  const [enrollCode, setEnrollCode] = useState("");
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [savedConfirmed, setSavedConfirmed] = useState(false);

  /* غیرفعال‌سازی 2FA */
  const [disableOpen, setDisableOpen] = useState(false);
  const [disPass, setDisPass] = useState("");
  const [disCode, setDisCode] = useState("");
  const [disBusy, setDisBusy] = useState(false);

  /* پاک‌سازی */
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipePass, setWipePass] = useState("");
  const [wipeCode, setWipeCode] = useState("");
  const [wipeBusy, setWipeBusy] = useState(false);

  /* بارگذاری وضعیت امنیتی */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await api.auth.session();
        if (!alive) return;
        setHas2fa(s.has2fa);
        setActiveSessions(s.activeSessions);
      } catch {
        /* نادیده بگیر */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ---------- تغییر رمز ---------- */
  const changePassword = async () => {
    if (passBusy) return;
    if (newPass.length < 8) {
      toast.error("رمز جدید باید حداقل ۸ کاراکتر باشد");
      return;
    }
    if (newPass !== confirmPass) {
      toast.error("رمز جدید و تکرار آن یکسان نیستند");
      return;
    }
    setPassBusy(true);
    try {
      const { message } = await api.auth.changePassword(current, newPass, has2fa ? passTotp.trim() : undefined);
      toast.success(message);
      setCurrent(""); setNewPass(""); setConfirmPass(""); setPassTotp("");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "تغییر رمز ناموفق بود");
    } finally {
      setPassBusy(false);
    }
  };

  /* ---------- 2FA ---------- */
  const openEnroll = async () => {
    setEnrollOpen(true);
    setEnrollQr(null);
    setEnrollCode("");
    setBackupCodes(null);
    setSavedConfirmed(false);
    try {
      const res = await api.auth.totpEnroll();
      setEnrollSecret(res.secret);
      setEnrollQr(await qrDataUrl(res.otpauthUri));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "شروع فعال‌سازی ناموفق بود");
      setEnrollOpen(false);
    }
  };

  const submitEnrollCode = async () => {
    if (enrollBusy || !/^\d{6}$/.test(enrollCode)) {
      if (!/^\d{6}$/.test(enrollCode)) toast.error("کد ۶ رقمی را وارد کنید");
      return;
    }
    setEnrollBusy(true);
    try {
      const res = await api.auth.totpEnable(enrollCode);
      setBackupCodes(res.backupCodes);
      setHas2fa(true);
      toast.success("ورود دومرحله‌ای فعال شد");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "کد نامعتبر است");
    } finally {
      setEnrollBusy(false);
    }
  };

  const disable2fa = async () => {
    if (disBusy) return;
    setDisBusy(true);
    try {
      await api.auth.totpDisable(disPass, disCode);
      setHas2fa(false);
      setDisableOpen(false);
      setDisPass(""); setDisCode("");
      toast.success("ورود دومرحله‌ای غیرفعال شد");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "غیرفعال‌سازی ناموفق بود");
    } finally {
      setDisBusy(false);
    }
  };

  const regenerateBackup = async () => {
    try {
      const res = await api.auth.totpBackupRegenerate(disPass, disCode);
      setBackupCodes(res.backupCodes);
      toast.success("کدهای پشتیبان جدید تولید شد — قدیمی‌ها باطل شدند");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "تولید مجدد ناموفق بود");
    }
  };

  const copyText = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} کپی شد`);
    } catch {
      toast.error("کپی ناموفق بود");
    }
  };

  const downloadBackupCodes = (codes: string[]) => {
    const content =
      "WallGold Manager — کدهای پشتیبان ورود دومرحله‌ای\n" +
      "تاریخ تولید: " + new Date().toLocaleString("fa-IR") + "\n\n" + codes.join("\n") + "\n";
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wallgold-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ---------- خروج همه ---------- */
  const [logoutAllBusy, setLogoutAllBusy] = useState(false);
  const logoutAll = async () => {
    setLogoutAllBusy(true);
    try {
      await api.auth.logoutAll();
      window.location.reload();
    } catch {
      setLogoutAllBusy(false);
    }
  };

  /* ---------- پاک‌سازی ---------- */
  const wipe = async () => {
    if (wipeBusy) return;
    setWipeBusy(true);
    try {
      await api.wipeAll(wipePass, has2fa ? wipeCode.trim() : undefined);
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "پاک‌سازی ناموفق بود");
      setWipeBusy(false);
    }
  };

  return (
    <Card className="border-destructive/20">
      <CardContent className="p-5 space-y-5">
        <h3 className="font-bold flex items-center gap-2">
          <ShieldCheck className="w-4.5 h-4.5 text-gold" aria-hidden="true" />
          امنیت
        </h3>

        {/* ---------- ورود دومرحله‌ای ---------- */}
        <div className="space-y-4 rounded-xl border border-border/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />
                ورود دومرحله‌ای (2FA)
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                {has2fa === null ? "در حال بررسی وضعیت…" : has2fa ? "فعال — ورود با رمز + کد اپ Authenticator" : "غیرفعال — توصیه می‌شود فعال کنید"}
              </p>
            </div>
            {has2fa && (
              <Badge className="bg-buy/15 text-buy border-0" variant="secondary">فعال</Badge>
            )}
          </div>

          {has2fa ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setDisableOpen(true)}>
                مدیریت / غیرفعال‌سازی
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={openEnroll} disabled={has2fa === null}>
              <Smartphone className="w-3.5 h-3.5 me-1" aria-hidden="true" />
              فعال‌سازی 2FA
            </Button>
          )}
        </div>

        {/* ---------- تغییر رمز عبور ---------- */}
        <div className="space-y-4 rounded-xl border border-border/60 p-4">
          <div>
            <Label className="flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
              تغییر رمز عبور
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              پس از تغییر، همه دستگاه‌های دیگر به‌صورت خودکار خارج می‌شوند.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sec-current">رمز فعلی</Label>
            <Input
              id="sec-current"
              type="password"
              dir="ltr"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sec-new">رمز جدید</Label>
              <Input
                id="sec-new"
                type="password"
                dir="ltr"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                placeholder="حداقل ۸ کاراکتر"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sec-confirm">تکرار رمز جدید</Label>
              <Input
                id="sec-confirm"
                type="password"
                dir="ltr"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          {has2fa && (
            <div className="space-y-2">
              <Label htmlFor="sec-totp">کد تأیید دومرحله‌ای</Label>
              <Input
                id="sec-totp"
                dir="ltr"
                inputMode="numeric"
                maxLength={6}
                value={passTotp}
                onChange={(e) => setPassTotp(e.target.value.replace(/\D/g, ""))}
                className="text-center tracking-[0.3em]"
              />
            </div>
          )}
          <Button onClick={changePassword} disabled={passBusy || !current || !newPass || !confirmPass}>
            {passBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <KeyRound className="w-4 h-4 me-1" aria-hidden="true" />}
            تغییر رمز عبور
          </Button>
        </div>

        {/* ---------- نشست‌ها و خروج خودکار ---------- */}
        <div className="space-y-4 rounded-xl border border-border/60 p-4">
          <div>
            <Label>نشست‌های فعال</Label>
            <p className="text-xs text-muted-foreground mt-1">
              {activeSessions === null ? "—" : `${activeSessions} نشست فعال — هر نشست حداکثر ۱ ساعت اعتبار دارد`}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={logoutAll} disabled={logoutAllBusy}>
            {logoutAllBusy ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" aria-hidden="true" /> : <LogOut className="w-3.5 h-3.5 me-1" aria-hidden="true" />}
            خروج از همه دستگاه‌ها
          </Button>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>خروج خودکار پس از بی‌فعالیتی</Label>
              <p className="text-xs text-muted-foreground mt-1">۰ = فقط انقضای یک‌ساعته نشست</p>
            </div>
            <Select
              value={String(settings.autoLogoutMinutes)}
              onValueChange={async (v) => {
                const minutes = Number(v);
                const { settings: s } = await api.saveSettings({ autoLogoutMinutes: minutes });
                setSettings(s);
              }}
            >
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="5">۵ دقیقه</SelectItem>
                <SelectItem value="10">۱۰ دقیقه</SelectItem>
                <SelectItem value="15">۱۵ دقیقه</SelectItem>
                <SelectItem value="30">۳۰ دقیقه</SelectItem>
                <SelectItem value="60">۶۰ دقیقه</SelectItem>
                <SelectItem value="0">غیرفعال</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ---------- پاک‌سازی کامل ---------- */}
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Trash className="w-5 h-5 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-bold text-destructive">پاک‌سازی کامل داده‌ها</p>
              <p className="text-xs text-muted-foreground mt-1 leading-5">
                تمام حساب‌ها، توکن‌های رمزنگاری‌شده، تاریخچه سفارشات، تنظیمات، رمز عبور و 2FA برای همیشه حذف
                می‌شوند. این عمل غیرقابل برگشت است.
              </p>
            </div>
          </div>
          <Button variant="destructive" onClick={() => setWipeOpen(true)} className="sm:w-auto w-full">
            <Trash className="w-4 h-4 me-1" aria-hidden="true" />
            پاک‌سازی همه داده‌ها و توکن‌ها
          </Button>
        </div>
      </CardContent>

      {/* ---------- دیالوگ فعال‌سازی 2FA ---------- */}
      <Dialog open={enrollOpen} onOpenChange={(v) => !v && !backupCodes && setEnrollOpen(false)}>
        <DialogContent dir="rtl" className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          {!backupCodes ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-gold" aria-hidden="true" />
                  فعال‌سازی ورود دومرحله‌ای
                </DialogTitle>
                <DialogDescription>
                  QR را با اپ Authenticator اسکن کنید یا راش را دستی وارد نمایید، سپس کد ۶ رقمی را تأیید کنید.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {enrollQr ? (
                  <div className="flex justify-center">
                    <img
                      src={enrollQr}
                      alt="QR کد اتصال به اپ Authenticator"
                      width={200}
                      height={200}
                      className="rounded-xl border-4 border-white bg-white"
                    />
                  </div>
                ) : (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" aria-hidden="true" />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>راش دستی</Label>
                  <div className="flex items-center gap-2">
                    <code dir="ltr" className="flex-1 block rounded-lg bg-muted px-3 py-2.5 text-xs font-mono break-all select-all">
                      {enrollSecret}
                    </code>
                    <Button type="button" variant="outline" size="icon" onClick={() => copyText(enrollSecret, "راش")} aria-label="کپی راش">
                      <Copy className="w-4 h-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="enroll-code">کد ۶ رقمی اپ</Label>
                  <Input
                    id="enroll-code"
                    dir="ltr"
                    inputMode="numeric"
                    maxLength={6}
                    value={enrollCode}
                    onChange={(e) => setEnrollCode(e.target.value.replace(/\D/g, ""))}
                    className="text-center text-lg tracking-[0.4em]"
                  />
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setEnrollOpen(false)}>انصراف</Button>
                  <Button onClick={submitEnrollCode} disabled={enrollBusy || enrollCode.length !== 6}>
                    {enrollBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4 me-1" aria-hidden="true" />}
                    تأیید و فعال‌سازی
                  </Button>
                </DialogFooter>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-gold" aria-hidden="true" />
                  کدهای پشتیبان — فقط همین یک‌بار
                </DialogTitle>
                <DialogDescription>
                  هر کد یک‌بار جایگزین کد ۶ رقمی می‌شود. در جای امن ذخیره کنید.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2" dir="ltr">
                  {backupCodes.map((c) => (
                    <code key={c} className="rounded-lg bg-muted px-3 py-2 text-center text-xs font-mono select-all">
                      {c}
                    </code>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => copyText(backupCodes.join("\n"), "کدهای پشتیبان")}>
                    <Copy className="w-4 h-4 me-1" aria-hidden="true" /> کپی همه
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => downloadBackupCodes(backupCodes)}>
                    <Download className="w-4 h-4 me-1" aria-hidden="true" /> دانلود
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="saved2" checked={savedConfirmed} onCheckedChange={(v) => setSavedConfirmed(v === true)} />
                  <Label htmlFor="saved2" className="text-sm font-normal">کدها را در جای امن ذخیره کردم</Label>
                </div>
                <Button className="w-full" disabled={!savedConfirmed} onClick={() => setEnrollOpen(false)}>
                  <Check className="w-4 h-4 me-1" aria-hidden="true" /> پایان
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- دیالوگ مدیریت/غیرفعال‌سازی 2FA ---------- */}
      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-gold" aria-hidden="true" />
              مدیریت ورود دومرحله‌ای
            </DialogTitle>
            <DialogDescription>
              برای غیرفعال‌سازی 2FA یا تولید مجدد کدهای پشتیبان، رمز عبور و کد فعلی را وارد کنید.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dis-pass">رمز عبور</Label>
              <Input id="dis-pass" type="password" dir="ltr" value={disPass} onChange={(e) => setDisPass(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dis-code">کد ۶ رقمی یا کد پشتیبان</Label>
              <Input
                id="dis-code"
                dir="ltr"
                value={disCode}
                onChange={(e) => setDisCode(e.target.value)}
                className="text-center tracking-widest"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={regenerateBackup} disabled={!disPass || !disCode}>
                <Copy className="w-4 h-4 me-1" aria-hidden="true" /> تولید مجدد کدهای پشتیبان
              </Button>
              <Button variant="destructive" onClick={disable2fa} disabled={disBusy || !disPass || !disCode}>
                {disBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <AlertTriangle className="w-4 h-4 me-1" aria-hidden="true" />}
                غیرفعال‌سازی 2FA
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- تأیید پاک‌سازی ---------- */}
      <Dialog open={wipeOpen} onOpenChange={setWipeOpen}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
              پاک‌سازی کامل داده‌ها
            </DialogTitle>
            <DialogDescription>
              این عمل تمام حساب‌ها، توکن‌ها، تاریخچه، تنظیمات، رمز عبور و 2FA را برای همیشه حذف می‌کند و اپلیکیشن
              به حالت راه‌اندازی اولیه برمی‌گردد. مطمئن هستید؟
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wipe-pass">رمز عبور برای تأیید</Label>
              <Input
                id="wipe-pass"
                type="password"
                dir="ltr"
                value={wipePass}
                onChange={(e) => setWipePass(e.target.value)}
              />
            </div>
            {has2fa && (
              <div className="space-y-2">
                <Label htmlFor="wipe-code">کد تأیید دومرحله‌ای</Label>
                <Input
                  id="wipe-code"
                  dir="ltr"
                  value={wipeCode}
                  onChange={(e) => setWipeCode(e.target.value)}
                  className="text-center tracking-widest"
                />
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setWipeOpen(false)} disabled={wipeBusy}>
                انصراف
              </Button>
              <Button
                variant="destructive"
                onClick={wipe}
                disabled={wipeBusy || !wipePass || (has2fa === true && !wipeCode)}
              >
                {wipeBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Trash className="w-4 h-4 me-1" aria-hidden="true" />}
                پاک‌سازی قطعی
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
