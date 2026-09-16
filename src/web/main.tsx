import "./styles.css";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(<App />);

/* ------------------- ثبت Service Worker (فقط نسخه پروداکشن) -------------------
 * در حالت توسعه (vite dev روی پورت ۵۱۷۳) ثبت نمی‌شود تا کش، HMR را نشکند.
 * SW هرگز درخواست‌های /api/* را کش نمی‌کند (کد در public/sw.js). */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* ثبت نشد — اپ بدون قابلیت آفلاین هم کامل کار می‌کند */
    });
  });
}
