"use client";

/**
 * پنل امنیت (تب سوم تنظیمات):
 * - داشبورد رویدادهای امنیتی + بن‌های فعال + نشست‌های فعال
 * - ورود دومرحله‌ای (فعال‌سازی/غیرفعال‌سازی/کدهای پشتیبان)
 * - تغییر رمز عبور
 * - خروج از همه دستگاه‌ها
 * - پاک‌سازی کامل
 */

import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/store/app-store";
import { api, ApiError, type SecurityEvent, type SessionDevice } from "@/lib/client-api";
import { qrDataUrl } from "@/lib/qr";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  ShieldCheck,
  Loader2,
  Trash,
  AlertTriangle,
  KeyRound,
  Smartphone,
  Copy,
  Download,
  Check,
  LogOut,
  ShieldAlert,
  ShieldX,
  UserCheck,
  UserX,
  Bot,
  Ban,
  Clock,
  Monitor,
  RefreshCw,
  Blocks,
  Laptop,
  Smartphone as PhoneIcon,
  Tablet,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* --------------------------- برچسب رویدادهای امنیتی --------------------------- */

const EVENT_META: Record<string, { label: string; icon: typeof ShieldCheck; tone: "danger" | "ok" | "warn" | "info" }> = {
  login_failed: { label: "ورود ناموفق", icon: UserX, tone: "danger" },
  login_success: { label: "ورود موفق", icon: UserCheck, tone: "ok" },
  totp_failed: { label: "کد ۲FA نامعتبر", icon: UserX, tone: "danger" },
  setup_completed: { label: "راه‌اندازی اولیه", icon: ShieldCheck, tone: "info" },
  password_changed: { label: "تغییر رمز عبور", icon: KeyRound, tone: "info" },
  "2fa_enabled": { label: "فعال‌سازی ورود دومرحله‌ای", icon: ShieldCheck, tone: "ok" },
  "2fa_disabled": { label: "غیرفعال‌سازی ورود دومرحله‌ای", icon: ShieldAlert, tone: "warn" },
  rate_limited: { label: "محدودیت نرخ فعال شد", icon: Clock, tone: "warn" },
  ip_banned: { label: "IP مهاجم مسدود شد", icon: Ban, tone: "danger" },
  banned_access: { label: "تلاش ورود در حالت مسدودی", icon: Ban, tone: "danger" },
  bot_blocked: { label: "ربات/ابزار حمله مسدود شد", icon: Bot, tone: "danger" },
  csrf_blocked: { label: "درخواست جعلی (CSRF) مسدود", icon: ShieldX, tone: "danger" },
  unban_action: { label: "رفع مسدودی دستی", icon: Blocks, tone: "info" },
  wipe_executed: { label: "پاک‌سازی کامل داده‌ها", icon: Trash, tone: "danger" },
  logout_all: { label: "خروج از همه دستگاه‌ها", icon: LogOut, tone: "info" },
};

const TONE_CLASS: Record<string, string> = {
  danger: "text-sell bg-sell/10",
  ok: "text-buy bg-buy/10",
  warn: "text-gold bg-gold/10",
  info: "text-muted-foreground bg-muted",
};

/** زمان نسبی فارسی گذشته: «۳ دقیقه پیش» */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "همین حالا";
  if (m < 60) return `${toFa(m)} دقیقه پیش`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${toFa(h)} ساعت پیش`;
  return `${toFa(Math.floor(h / 24))} روز پیش`;
}

/** زمان نسبی فارسی آینده: «۱۴ دقیقه دیگر» */
function timeUntil(epochMs: number): string {
  const diff = epochMs - Date.now();
  if (diff <= 0) return "قریب‌الوقوع";
  const m = Math.ceil(diff / 60_000);
  if (m < 60) return `${toFa(m)} دقیقه دیگر`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${toFa(h)} ساعت دیگر`;
  return `${toFa(Math.floor(h / 24))} روز دیگر`;
}
function toFa(n: number | string): string {
  return String(n).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/** خلاصه دستگاه از User-Agent */
function deviceSummary(ua: string | null): { icon: typeof Monitor; label: string } {
  if (!ua) return { icon: Monitor, label: "دستگاه ناشناس" };
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "مرورگر ناشناس";
  if (/iPhone|iPad|iPod/.test(ua)) return { icon: PhoneIcon, label: `${browser} — iOS` };
  if (/Android/.test(ua)) return { icon: PhoneIcon, label: `${browser} — Android` };
  if (/Mobile|Tablet/.test(ua)) return { icon: Tablet, label: `${browser} — موبایل` };
  if (/Windows/.test(ua)) return { icon: Monitor, label: `${browser} — ویندوز` };
  if (/Mac OS/.test(ua)) return { icon: Monitor, label: `${browser} — مک` };
  if (/Linux/.test(ua)) return { icon: Monitor, label: `${browser} — لینوکس` };
  return { icon: Monitor, label: browser };
}

/* ------------------------------ پنل اصلی ------------------------------ */

export function SecurityPanel() {
  /* ---------- 2FA ---------- */
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

  /* خروج همه */
  const [logoutAllBusy, setLogoutAllBusy] = useState(false);

  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);

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
    <div className="space-y-5">
      {/* داشبورد رویدادهای امنیتی و دفاع */}
      <SecurityDashboardSection />

      {/* ورود دومرحله‌ای */}
      <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 space-y-4">
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
          {has2fa && <Badge className="bg-buy/15 text-buy border-0" variant="secondary">فعال</Badge>}
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

      {/* تغییر رمز عبور */}
      <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 space-y-4">
        <div>
          <Label className="flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
            تغییر رمز عبور
          </Label>
          <p className="text-xs text-muted-foreground mt-1">پس از تغییر، همه دستگاه‌های دیگر به‌صورت خودکار خارج می‌شوند.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              disabled={has2fa === false}
              placeholder={has2fa === false ? "لازم نیست" : "۶ رقم"}
            />
          </div>
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
        <Button onClick={changePassword} disabled={passBusy || !current || !newPass || !confirmPass} className="w-full sm:w-auto">
          {passBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <KeyRound className="w-4 h-4 me-1" aria-hidden="true" />}
          تغییر رمز عبور
        </Button>
      </div>

      {/* نشست‌ها و خروج خودکار */}
      <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 space-y-4">
        <div>
          <Label>نشست‌های فعال</Label>
          <p className="text-xs text-muted-foreground mt-1">
            {activeSessions === null ? "—" : `${toFa(activeSessions)} نشست فعال — هر نشست حداکثر ۱ ساعت اعتبار دارد`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <Button variant="outline" size="sm" onClick={logoutAll} disabled={logoutAllBusy}>
            {logoutAllBusy ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" aria-hidden="true" /> : <LogOut className="w-3.5 h-3.5 me-1" aria-hidden="true" />}
            خروج از همه دستگاه‌ها
          </Button>
          <div className="flex items-center gap-3">
            <Label className="text-xs text-muted-foreground shrink-0">خروج خودکار پس از بی‌فعالیتی</Label>
            <Select
              value={String(settings.autoLogoutMinutes)}
              onValueChange={async (v) => {
                const minutes = Number(v);
                const { settings: s } = await api.saveSettings({ autoLogoutMinutes: minutes });
                setSettings(s);
              }}
            >
              <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
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
      </div>

      {/* پاک‌سازی کامل */}
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:p-5 space-y-3">
        <div className="flex items-start gap-3">
          <Trash className="w-5 h-5 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-bold text-destructive">پاک‌سازی کامل داده‌ها</p>
            <p className="text-xs text-muted-foreground mt-1 leading-5">
              تمام حساب‌ها، توکن‌های رمزنگاری‌شده، تاریخچه سفارشات، نمودارها، تنظیمات، رمز عبور و 2FA برای همیشه حذف
              می‌شوند. این عمل غیرقابل برگشت است.
            </p>
          </div>
        </div>
        <Button variant="destructive" onClick={() => setWipeOpen(true)} className="w-full sm:w-auto">
          <Trash className="w-4 h-4 me-1" aria-hidden="true" />
          پاک‌سازی همه داده‌ها و توکن‌ها
        </Button>
      </div>

      {/* ---------- دیالوگ فعال‌سازی 2FA ---------- */}
      <Dialog open={!!enrollOpen} onOpenChange={(v) => !v && !backupCodes && setEnrollOpen(false)}>
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
                <DialogDescription>هر کد یک‌بار جایگزین کد ۶ رقمی می‌شود. در جای امن ذخیره کنید.</DialogDescription>
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
              این عمل تمام حساب‌ها، توکن‌ها، تاریخچه، نمودارها، تنظیمات، رمز عبور و 2FA را برای همیشه حذف می‌کند و
              اپلیکیشن به حالت راه‌اندازی اولیه برمی‌گردد. مطمئن هستید؟
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wipe-pass">رمز عبور برای تأیید</Label>
              <Input id="wipe-pass" type="password" dir="ltr" value={wipePass} onChange={(e) => setWipePass(e.target.value)} />
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
    </div>
  );
}

/* --------------------- داشبورد رویدادها و دفاع سایبری --------------------- */

function SecurityDashboardSection() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getSecurityDashboard>> | null>(null);
  const [sessions, setSessions] = useState<SessionDevice[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unbanBusy, setUnbanBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboard, sess] = await Promise.all([api.getSecurityDashboard(), api.getSessions()]);
      setData(dashboard);
      setSessions(sess.sessions);
    } catch {
      /* نادیده بگیر */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unban = async () => {
    if (unbanBusy) return;
    setUnbanBusy(true);
    try {
      const { message } = await api.unbanAll();
      toast.success(message);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "رفع مسدودی ناموفق بود");
    } finally {
      setUnbanBusy(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 space-y-4">
        <Skeleton className="h-5 w-44" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const stats = data?.stats;
  const events = data?.events ?? [];
  const bans = data?.bans ?? [];

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4.5 h-4.5 text-gold" aria-hidden="true" />
          <h3 className="font-bold">دفاع سایبری و رویدادها</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={load} title="به‌روزرسانی" aria-label="به‌روزرسانی رویدادهای امنیتی">
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
        </Button>
      </div>

      {/* آمار ۲۴ ساعت */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatChip
          label="ورود ناموفق (۲۴س)"
          value={stats?.failedLogins24h ?? 0}
          tone={(stats?.failedLogins24h ?? 0) > 0 ? "danger" : "ok"}
        />
        <StatChip label="ورود موفق (۲۴س)" value={stats?.successfulLogins24h ?? 0} tone="ok" />
        <StatChip
          label="IP مسدودشده"
          value={stats?.activeBans ?? 0}
          tone={(stats?.activeBans ?? 0) > 0 ? "danger" : "ok"}
        />
        <StatChip label="نشست فعال" value={stats?.activeSessions ?? 0} tone="info" />
      </div>

      {/* بن‌های فعال */}
      {bans.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-destructive flex items-center gap-1.5">
              <Ban className="w-3.5 h-3.5" aria-hidden="true" />
              آدرس‌های مسدودشده فعلی
            </p>
            <Button variant="outline" size="sm" onClick={unban} disabled={unbanBusy} className="h-8 text-xs">
              {unbanBusy ? <Loader2 className="w-3 h-3 me-1 animate-spin" aria-hidden="true" /> : <Blocks className="w-3 h-3 me-1" aria-hidden="true" />}
              رفع همه مسدودی‌ها
            </Button>
          </div>
          <div className="space-y-1.5">
            {bans.map((b) => (
              <div key={b.ip} className="flex items-center justify-between text-[11px] font-mono" dir="ltr">
                <span>{b.ip}</span>
                <span className="text-muted-foreground font-sans">
                  {toFa(b.strikes)} اخطار — آزادسازی: {timeUntil(b.bannedUntil)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* نشست‌های فعال */}
      {sessions && sessions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
            <Monitor className="w-3.5 h-3.5" aria-hidden="true" />
            دستگاه‌های متصل
          </p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto thin-scrollbar pe-1">
            {sessions.map((s) => {
              const d = deviceSummary(s.userAgent);
              return (
                <div
                  key={s.id}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[11px]",
                    s.current ? "border-gold/40 bg-gold/5" : "border-border/60"
                  )}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <d.icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                    <span className="truncate">{d.label}</span>
                    {s.current && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 shrink-0">
                        این دستگاه
                      </Badge>
                    )}
                  </span>
                  <span className="text-muted-foreground shrink-0 font-mono" dir="ltr">
                    {s.ip ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* رویدادها */}
      <div className="space-y-1.5">
        <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          آخرین رویدادهای امنیتی
        </p>
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3 text-center">هنوز رویدادی ثبت نشده است.</p>
        ) : (
          <div className="max-h-64 overflow-y-auto thin-scrollbar pe-1 divide-y divide-border/40">
            {events.map((ev: SecurityEvent) => (
              <EventRow key={ev.id} ev={ev} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatChip({ label, value, tone }: { label: string; value: number; tone: "danger" | "ok" | "info" }) {
  return (
    <div className="rounded-xl border border-border/60 p-3">
      <p className="text-[10px] text-muted-foreground mb-1 leading-4">{label}</p>
      <p
        className={cn(
          "text-xl font-bold tabular-nums leading-tight",
          tone === "danger" && value > 0 ? "text-sell" : tone === "ok" ? "text-buy" : "text-foreground"
        )}
        dir="ltr"
      >
        {toFa(value)}
      </p>
    </div>
  );
}

function EventRow({ ev }: { ev: SecurityEvent }) {
  const meta = EVENT_META[ev.type] ?? { label: ev.type, icon: ShieldAlert, tone: "warn" as const };
  const Icon = meta.icon;
  return (
    <div className="flex items-start gap-2.5 py-2">
      <span className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", TONE_CLASS[meta.tone])}>
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium truncate">{meta.label}</p>
          <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(ev.createdAt)}</span>
        </div>
        <p className="text-[10px] text-muted-foreground truncate leading-4">
          {ev.detail ?? "—"}
          {ev.ip ? ` — ${ev.ip}` : ""}
        </p>
      </div>
    </div>
  );
}
