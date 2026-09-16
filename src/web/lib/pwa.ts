/**
 * هوک نصب PWA — مدیریت رویداد beforeinstallprompt و تشخیص حالت نصب‌شده
 *
 * - canInstall: مرورگر (کروم/اج/اندروید) آماده نمایش گفت‌وگوی نصب است
 * - promptInstall(): گفت‌وگوی نصب را باز می‌کند
 * - isStandalone: اپ در حالت نصب‌شده اجرا می‌شود
 * - isIOS: سافاری iOS (نیازمند راهنمای نصب دستی از منوی اشتراک‌گذاری)
 */

import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const checkStandalone = () =>
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(checkStandalone());
    setIsIOS(
      /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
        (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1)
    );

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setIsStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") {
      setDeferred(null);
    }
  }, [deferred]);

  return { canInstall: !!deferred, promptInstall, isStandalone, isIOS };
}
