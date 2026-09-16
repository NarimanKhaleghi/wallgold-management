"use client";

/**
 * صفحه‌های احراز هویت:
 * - FullScreenLoader: بررسی نشست اولیه
 * - SetupWizard:      راه‌اندازی اولیه (رمز ← 2FA با QR و راش ← کدهای پشتیبان)
 * - LoginScreen:      ورود با رمز + کد 2FA
 */

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client-api";
import { qrDataUrl } from "@/lib/qr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Coins,
  Loader2,
  ShieldCheck,
  Lock,
  KeyRound,
  Smartphone,
  Copy,
  Check,
  Download,
  ArrowLeft,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* --------------------------------- لودر --------------------------------- */

export function FullScreenLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className="w-20 h-20 rounded-3xl border-gold-gradient flex items-center justify-center mb-6">
        <Coins className="w-10 h-10 text-gold" aria-hidden="true" />
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        <span className="text-sm">در حال بررسی نشست…</span>
      </div>
    </div>
  );
}

/* ------------------------------ برند مشترک ------------------------------ */

function BrandHeader({ title, subtitle, icon: Icon }: { title: React.ReactNode; subtitle: string; icon?: typeof Lock }) {
  return (
    <div className="flex flex-col items-center mb-8">
      <div className="w-20 h-20 rounded-3xl border-gold-gradient flex items-center justify-center mb-5">
        <Coins className="w-10 h-10 text-gold" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-bold mb-1 text-center">
        مدیریت <span className="text-gold-gradient">وال‌گلد</span>
      </h1>
      <p className="text-sm text-muted-foreground flex items-center gap-1.5 text-center">
        {Icon && <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
        {subtitle}
      </p>
      <p className="text-[11px] text-muted-foreground/70 mt-1 text-center">{title}</p>
    </div>
  );
}

/* ---------------------------- ویزارد راه‌اندازی ---------------------------- */

type SetupStep = "password" | "totp-intro" | "totp-verify" | "backup" | "done";

export function SetupWizard({ onComplete }: { onComplete: (expiresAt: number, offset: number) => void }) {
  const [step, setStep] = useState<SetupStep>("password");
  const [setupExpiresAt, setSetupExpiresAt] = useState(0);

  /* مرحله رمز */
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* مرحله 2FA */
  const [secret, setSecret] = useState("");
  const [otpauthUri, setOtpauthUri] = useState("");
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [enrollBusy, setEnrollBusy] = useState(false);

  const passwordScore = (() => {
    let s = 0;
    if (password.length >= 8) s++;
    if (password.length >= 12) s++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) s++;
    if (/\d/.test(password)) s++;
    if (/[^a-zA-Z0-9]/.test(password)) s++;
    return Math.min(s, 5);
  })();

  const submitPassword = async () => {
    if (busy) return;
    if (password.length < 8) {
      setError("رمز عبور باید حداقل ۸ کاراکتر باشد.");
      return;
    }
    if (password !== confirm) {
      setError("رمز عبور و تکرار آن یکسان نیستند.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.auth.setup(password);
      // نشست ایجاد شد (کوکی تنظیم شد) — اما هنوز داخل ویزارد می‌مانیم تا 2FA پیشنهاد شود
      setSetupExpiresAt(res.expiresAt);
      setStep("totp-intro");
      toast.success("رمز عبور ایجاد شد");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "خطای نامشخص. مجدداً تلاش کنید.");
    } finally {
      setBusy(false);
    }
  };

  const startEnroll = async () => {
    setEnrollBusy(true);
    try {
      const res = await api.auth.totpEnroll();
      setSecret(res.secret);
      setOtpauthUri(res.otpauthUri);
      setQrSrc(await qrDataUrl(res.otpauthUri));
      setStep("totp-verify");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "شروع فعال‌سازی ناموفق بود");
    } finally {
      setEnrollBusy(false);
    }
  };

  const submitCode = async () => {
    if (busy) return;
    if (!/^\d{6}$/.test(code.trim())) {
      toast.error("کد ۶ رقمی نمایش‌داده‌شده در اپ Authenticator را وارد کنید");
      return;
    }
    setBusy(true);
    try {
      const res = await api.auth.totpEnable(code.trim());
      setBackupCodes(res.backupCodes);
      setStep("backup");
      toast.success("ورود دومرحله‌ای فعال شد");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "کد نامعتبر است");
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} کپی شد`);
    } catch {
      toast.error("کپی ناموفق بود — دستی انتخاب و کپی کنید");
    }
  };

  const downloadBackupCodes = () => {
    const content =
      "WallGold Manager — کدهای پشتیبان ورود دومرحله‌ای\n" +
      "هر کد فقط یک‌بار قابل استفاده است.\n" +
      "تاریخ تولید: " +
      new Date().toLocaleString("fa-IR") +
      "\n\n" +
      backupCodes.join("\n") +
      "\n";
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wallgold-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-md">
        {step === "password" && (
          <>
            <BrandHeader
              title="راه‌اندازی اولیه — این مرحله فقط یک‌بار انجام می‌شود"
              subtitle="ساخت رمز عبور"
              icon={KeyRound}
            />
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitPassword();
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="su-pass">رمز عبور</Label>
                <Input
                  id="su-pass"
                  type="password"
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="حداقل ۸ کاراکتر"
                  autoFocus
                  autoComplete="new-password"
                  aria-invalid={!!error}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="su-confirm">تکرار رمز عبور</Label>
                <Input
                  id="su-confirm"
                  type="password"
                  dir="ltr"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="تکرار رمز"
                  autoComplete="new-password"
                  aria-invalid={!!error}
                  aria-describedby={error ? "su-error" : undefined}
                />
                {error && (
                  <p id="su-error" className="text-destructive text-sm" role="alert">
                    {error}
                  </p>
                )}
              </div>

              {/* نشانگر قدرت رمز */}
              <div className="flex items-center gap-1.5" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1 flex-1 rounded-full transition-colors",
                      passwordScore >= i
                        ? passwordScore <= 2
                          ? "bg-destructive"
                          : passwordScore === 3
                            ? "bg-yellow-500"
                            : "bg-buy"
                        : "bg-muted"
                    )}
                  />
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground leading-5">
                از ترکیب حروف بزرگ و کوچک، اعداد و نمادها استفاده کنید. این رمز تنها کلید ورود شماست و در سرور
                فقط به‌صورت هش (PBKDF2) ذخیره می‌شود.
              </p>

              <Button type="submit" className="w-full" disabled={busy || !password || !confirm}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="w-4 h-4 me-1" aria-hidden="true" />}
                {busy ? "در حال ایجاد…" : "ایجاد رمز و ادامه"}
              </Button>
            </form>
          </>
        )}

        {step === "totp-intro" && (
          <>
            <BrandHeader title="مرحله دوم راه‌اندازی" subtitle="ورود دومرحله‌ای (2FA)" icon={Smartphone} />
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground leading-7">
                برای امنیت بیشتر، فعال‌سازی <b>ورود دومرحله‌ای</b> را به‌شدت توصیه می‌کنیم. با فعال‌سازی آن، حتی اگر
                رمز عبور شما لو برود، هیچ‌کس بدون کد ۶ رقمی تولیدشده در گوشی شما نمی‌تواند وارد شود.
              </p>
              <ul className="text-xs text-muted-foreground space-y-2 leading-6">
                <li>• با همه اپ‌های Authenticator سازگار است: Google Authenticator، Microsoft Authenticator، Authy، Aegis، 1Password و…</li>
                <li>• در صورت گم کردن گوشی، با ۸ کد پشتیبان یک‌بارمصرف می‌توانید وارد شوید</li>
                <li>• بعداً هم می‌توانید از تنظیمات → امنیت فعال کنید</li>
              </ul>
              <div className="flex flex-col gap-2">
                <Button onClick={startEnroll} disabled={enrollBusy}>
                  {enrollBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Smartphone className="w-4 h-4 me-1" aria-hidden="true" />}
                  {enrollBusy ? "در حال آماده‌سازی…" : "فعال‌سازی ورود دومرحله‌ای"}
                </Button>
                <Button variant="ghost" onClick={() => setStep("done")}>
                  بعداً انجام می‌دهم
                </Button>
              </div>
            </div>
          </>
        )}

        {step === "totp-verify" && (
          <>
            <BrandHeader title="اپ Authenticator خود را راه بیندازید" subtitle="اسکن QR یا ورود دستی راش" icon={Smartphone} />
            <div className="space-y-5">
              {qrSrc ? (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <img
                    src={qrSrc}
                    alt="QR کد اتصال به اپ Authenticator"
                    width={200}
                    height={200}
                    className="rounded-xl border-4 border-white bg-white"
                  />
                </div>
              ) : (
                <div className="flex justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" aria-hidden="true" />
                </div>
              )}

              <div className="space-y-2">
                <Label>راش دستی (اگر نمی‌توانید QR را اسکن کنید)</Label>
                <div className="flex items-center gap-2">
                  <code
                    dir="ltr"
                    className="flex-1 block rounded-lg bg-muted px-3 py-2.5 text-xs font-mono break-all select-all"
                  >
                    {secret}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => copyText(secret, "راش")}
                    aria-label="کپی راش"
                  >
                    <Copy className="w-4 h-4" aria-hidden="true" />
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground leading-5">
                  در اپ Authenticator گزینه «Enter a setup key» را انتخاب کرده و این راش را وارد کنید (نوع: Time-based،
                  ۶ رقم، بازه ۳۰ ثانیه).
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="su-totp">کد ۶ رقمی اپ را وارد کنید</Label>
                <Input
                  id="su-totp"
                  dir="ltr"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="------"
                  className="text-center text-lg tracking-[0.4em]"
                  autoFocus
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("totp-intro")}>
                  <ArrowLeft className="w-4 h-4 me-1" aria-hidden="true" /> بازگشت
                </Button>
                <Button className="flex-1" onClick={submitCode} disabled={busy || code.length !== 6}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="w-4 h-4 me-1" aria-hidden="true" />}
                  تأیید و فعال‌سازی
                </Button>
              </div>
            </div>
          </>
        )}

        {step === "backup" && (
          <>
            <BrandHeader title="این کدها را در جای امن ذخیره کنید" subtitle="کدهای پشتیبان یک‌بارمصرف" icon={ShieldAlert} />
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground leading-6">
                اگر به اپ Authenticator خود دسترسی نداشتید، هر یک از این کدها یک‌بار جایگزین کد ۶ رقمی می‌شود. این
                کدها <b>فقط همین یک‌بار</b> نمایش داده می‌شوند.
              </p>
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
                <Button variant="outline" className="flex-1" onClick={downloadBackupCodes}>
                  <Download className="w-4 h-4 me-1" aria-hidden="true" /> دانلود
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="saved" checked={savedConfirmed} onCheckedChange={(v) => setSavedConfirmed(v === true)} />
                <Label htmlFor="saved" className="text-sm font-normal">
                  کدها را در جای امن ذخیره کردم
                </Label>
              </div>
              <Button className="w-full" disabled={!savedConfirmed} onClick={() => setStep("done")}>
                <Check className="w-4 h-4 me-1" aria-hidden="true" /> پایان راه‌اندازی
              </Button>
            </div>
          </>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center py-8">
            <div className="w-16 h-16 rounded-full bg-buy/15 flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-buy" aria-hidden="true" />
            </div>
            <h2 className="font-bold text-lg mb-2">راه‌اندازی کامل شد</h2>
            <p className="text-sm text-muted-foreground mb-6 text-center leading-6">
              اکنون می‌توانید اولین حساب وال‌گلد خود را اضافه کنید.
            </p>
            <Button onClick={() => onComplete(setupExpiresAt, 0)}>ورود به اپلیکیشن</Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ صفحه ورود ------------------------------ */

export function LoginScreen({
  has2fa,
  onLogin,
}: {
  has2fa: boolean;
  onLogin: (expiresAt: number, offset: number, has2fa: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [showTotp, setShowTotp] = useState(has2fa);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setShowTotp(has2fa), [has2fa]);

  const submit = async () => {
    if (!password || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.auth.login(password, showTotp ? totp.trim() : undefined);
      if (res.needs2fa) {
        setShowTotp(true);
        setError(null);
        toast.info("کد ۶ رقمی اپ Authenticator را وارد کنید");
        return;
      }
      if (res.expiresAt) {
        onLogin(res.expiresAt, 0, !!res.has2fa);
        toast.success("خوش آمدید");
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "ورود ناموفق بود.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <BrandHeader title="برای ورود، رمز عبور خود را وارد کنید" subtitle="ورود امن" icon={Lock} />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="login-password">رمز عبور</Label>
            <Input
              id="login-password"
              type="password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              autoComplete="current-password"
              aria-invalid={!!error}
            />
          </div>

          {showTotp && (
            <div className="space-y-2">
              <Label htmlFor="login-totp">کد تأیید دومرحله‌ای</Label>
              <Input
                id="login-totp"
                dir="ltr"
                inputMode="numeric"
                maxLength={6}
                value={totp}
                onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))}
                placeholder="کد ۶ رقمی یا کد پشتیبان"
                autoComplete="one-time-code"
                className="text-center tracking-[0.3em]"
              />
              <p className="text-[11px] text-muted-foreground leading-5">
                از اپ Authenticator یا یکی از کدهای پشتیبان استفاده کنید.
              </p>
            </div>
          )}

          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={!password || loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="w-4 h-4 me-1" aria-hidden="true" />}
            {loading ? "در حال بررسی…" : "ورود"}
          </Button>
        </form>

        <p className="text-[11px] text-muted-foreground text-center mt-6 leading-6">
          پس از ۵ تلاش ناموفق، ورود به‌مدت ۱۵ دقیقه قفل می‌شود. نشست شما حداکثر ۱ ساعت اعتبار دارد.
        </p>
      </div>
    </div>
  );
}
