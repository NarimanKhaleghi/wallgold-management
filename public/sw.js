/*
 * WallGold Manager — Service Worker
 *
 * استراتژی امن PWA:
 *  - درخواست‌های /api/* هرگز کش نمی‌شوند (داده‌های نشست و مالی — همیشه زنده)
 *  - ناوبری صفحات: شبکه‌محور با جایگزین کش (اپ پس از اولین بازدید آفلاین باز می‌شود)
 *  - فایل‌های استاتیک (JS/CSS/فونت/آیکون): stale-while-revalidate
 *  - پاسخ‌های غیر from cache-basic یا غیر 200 نادیده گرفته می‌شوند
 */

const CACHE = "wg-shell-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

const STATIC_RE = /\.(?:js|css|woff2?|png|svg|jpg|jpeg|webp|ico|webmanifest)$/i;

self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // داده‌های حساس — بدون کش

  if (req.mode === "navigate") {
    // شبکه‌محور با جایگزین کش برای ناوبری
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cached = await caches.match(req);
          if (cached) return cached;
          const shell = await caches.match("/");
          if (shell) return shell;
          return new Response(OFFLINE_HTML, {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
      })()
    );
    return;
  }

  if (STATIC_RE.test(url.pathname)) {
    // stale-while-replace برای فایل‌های استاتیک
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        const refresh = fetch(req)
          .then(async (res) => {
            if (res && res.status === 200 && res.type === "basic") {
              const cache = await caches.open(CACHE);
              cache.put(req, res.clone()).catch(() => {});
            }
            return res;
          })
          .catch(() => null);
        return cached || (await refresh) || new Response("", { status: 504 });
      })()
    );
  }
});

const OFFLINE_HTML = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>آفلاین — مدیریت وال‌گلد</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#12161d;color:#e9ecf1;font-family:Tahoma,sans-serif;text-align:center;padding:24px}
  .box{max-width:360px}
  h1{font-size:18px;margin:16px 0 8px}
  p{font-size:13px;line-height:2;color:#98a2b0;margin:0}
  .dot{width:56px;height:56px;border-radius:16px;border:1px solid #b99c49;display:flex;align-items:center;justify-content:center;margin:0 auto;font-size:24px;color:#b99c49}
</style>
</head>
<body>
<div class="box">
  <div class="dot">◉</div>
  <h1>اتصال اینترنت برقرار نیست</h1>
  <p>برای مشاهده موجودی و انجام معامله، ابتدا اتصال اینترنت را برقرار کنید و صفحه را دوباره باز کنید.</p>
</div>
</body>
</html>`;
