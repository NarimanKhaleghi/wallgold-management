"use client";

import { useState } from "react";
import { useAppStore } from "@/store/app-store";
import { api, ApiError } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Loader2, KeyRound, ShieldCheck, Info } from "lucide-react";
import { toast } from "sonner";

/** دیالوگ افزودن حساب وال‌گلد با اعتبارسنجی توکن */
export function AddAccountDialog({ asChild = true }: { asChild?: boolean }) {
  const setAccounts = useAppStore((s) => s.setAccounts);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (loading) return;
    const trimmedName = name.trim();
    const trimmedToken = token.trim();

    if (!trimmedName) {
      toast.error("نام حساب را وارد کنید");
      return;
    }
    if (!trimmedToken || trimmedToken.length < 10) {
      toast.error("توکن API معتبر وارد کنید");
      return;
    }

    setLoading(true);
    try {
      const { account } = await api.addAccount(trimmedName, trimmedToken);
      const { accounts } = await api.getAccounts();
      setAccounts(accounts);
      toast.success(`حساب «${account.name}» با موفقیت افزوده شد`);
      setOpen(false);
      setName("");
      setToken("");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "افزودن حساب ناموفق بود");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild={asChild}>
        <Button>
          <Plus className="w-4 h-4 me-1" aria-hidden="true" />
          افزودن حساب
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-gold" aria-hidden="true" />
            افزودن حساب وال‌گلد
          </DialogTitle>
          <DialogDescription>
            توکن API را از پنل وال‌گلد (بخش ساخت Api-Key) دریافت کنید. توکن پیش از ذخیره اعتبارسنجی و سپس به‌صورت
            رمزنگاری‌شده (AES-256-GCM) روی همین دستگاه نگهداری می‌شود.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="acc-name">نام حساب (دلخواه)</Label>
            <Input
              id="acc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: حساب شخصی"
              maxLength={60}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="acc-token">توکن API</Label>
            <Textarea
              id="acc-token"
              dir="ltr"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="YOUR_SECRET_TOKEN"
              className="font-mono text-xs min-h-[90px] resize-none"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
            <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="leading-5">
              توکن شما فقط برای ارتباط با API رسمی وال‌گلد استفاده می‌شود و به هیچ سرور ثالثی ارسال نمی‌گردد.
            </p>
          </div>
        </form>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            انصراف
          </Button>
          <Button onClick={submit} disabled={loading || !name.trim() || !token.trim()}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                در حال اعتبارسنجی توکن...
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 me-1" aria-hidden="true" />
                ذخیره حساب
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
