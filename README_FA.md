<div align="center">

# 🪙 مدیریت وال‌گلد — مدیریت امن چندحسابه طلا و نقره

**اپلیکیشن سلف‌هاست و امن‌محور برای مدیریت چند حساب [وال‌گلد](https://wallgold.ir): موجودی لحظه‌ای، معامله امن ۴ مرحله‌ای، ورود دومرحله‌ای TOTP و توکن‌های API رمزنگاری‌شده با AES-256. کاملاً روی Cloudflare Workers اجرا می‌شود.**

*[English documentation is available here](README.md)*

[![English](https://img.shields.io/badge/lang-en-gold?style=flat-square)](README.md)
[![فارسی](https://img.shields.io/badge/زبان-فارسی-000000?style=flat-square)](https://github.com/NarimanKhaleghi/wallgold-management/blob/main/README_FA.md)

---

[![GitHub stars](https://img.shields.io/github/stars/NarimanKhaleghi/wallgold-management?style=social)](https://github.com/NarimanKhaleghi/wallgold-management/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/NarimanKhaleghi/wallgold-management?style=social)](https://github.com/NarimanKhaleghi/wallgold-management/forks)
[![GitHub last commit](https://img.shields.io/github/last-commit/NarimanKhaleghi/wallgold-management)](https://github.com/NarimanKhaleghi/wallgold-management/commits/main)
[![License: MIT](https://img.shields.io/badge/license-MIT-000000?style=flat-square)](LICENSE)

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)
[![D1 Database](https://img.shields.io/badge/D1-SQLite-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/d1/)
[![Hono](https://img.shields.io/badge/Hono-4-e36002?style=flat-square&logo=hono&logoColor=white)](https://hono.dev/)
[![React 19](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS-4-06b6d4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?style=flat-square&logo=vite&logoColor=white)](https://vite.dev/)

### 🚀 با یک کلیک روی حساب Cloudflare خودتان مستقر کنید

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/NarimanKhaleghi/wallgold-management)

*بدون سرور، بدون ویرایش فایل کانفیگ، بدون ساخت دستی دیتابیس — دیتابیس D1 در اولین اجرا به‌صورت خودکار ساخته و آماده می‌شود.*

</div>

---

## 📸 اسکرین‌شات‌ها

| راه‌اندازی اولیه و فعال‌سازی 2FA | داشبورد و معامله |
|:---:|:---:|
| ![2FA](docs/screenshots/03-setup-2fa-qr.png) | ![داشبورد](docs/screenshots/10-dashboard-dark.png) |
| *QR کد + راش دستی + کدهای پشتیبان* | *قیمت لحظه‌ای، پورتفوی، ویزارد ۴ مرحله‌ای معامله* |

| ورود با کد دومرحله‌ای | تم روشن |
|:---:|:---:|
| ![ورود](docs/screenshots/07-login.png) | ![روشن](docs/screenshots/09-light-theme.png) |

## 🌟 درباره پروژه

**مدیریت وال‌گلد** یک پنل کنترل خصوصی و واحد برای تمام حساب‌های OTC طلا و نقره‌ی [وال‌گلد](https://wallgold.ir) شماست: موجودی لحظه‌ای همه حساب‌ها، فرآیند **تأیید ۴ مرحله‌ای** برای هر سفارش خرید/فروش (چون معامله یک‌کلیکی با پول واقعی خطرناک است)، تاریخچه کامل سفارشات و پیش‌فرض‌های امنیتی سخت‌گیرانه — ورود با رمز عبور، **ورود دومرحله‌ای TOTP**، نشست‌های یک‌ساعته و توکن‌های API رمزنگاری‌شده در حالت سکون با **AES-256-GCM**.

همه‌چیز به‌صورت یک **Cloudflare Worker** واحد با دیتابیس **D1** (SQLite) اجرا می‌شود: کلد-استارت زیر ۱۰۰ میلی‌ثانیه، بدون نگهداری سرور، و نمونه شما فقط مال خودتان است. توکن‌های وال‌گلد شما **هرگز به مرورگر نمی‌رسند** — همه تماس‌های خروجی فقط به `api.wallgold.ir` و از سمت سرور پروکسی می‌شوند. تنها وابستگی ران‌تایم بک‌اند [Hono](https://hono.dev/) است — سطح حمله زنجیره تأمین به‌عمد حداقلی است.

> ⚠️ **سلب مسئولیت:** این ابزار برای مدیریت حساب‌های خودتان است. معامله طلا/نقره ریسک دارد. مسئولیت استفاده با شماست.

## 🎯 امکانات کلیدی

| امکان | توضیح |
|:--------|:------------|
| 👥 **مدیریت چند حساب** | افزودن حساب نامحدود وال‌گلد با توکن API شخصی؛ هر توکن هنگام افزودن **اعتبارسنجی** و به‌صورت رمزنگاری‌شده (AES-256-GCM) ذخیره می‌شود و هرگز به مرورگر ارسال نمی‌گردد |
| 📊 **داشبورد لحظه‌ای** | موجودی طلا (۱۸ عیار ۷۵۰)، نقره (۹۲۵) و تومان هر حساب + مجموع کل به تومان، مبلغ آزاد و بلاک‌شده، قیمت لحظه‌ای، تغییرات/بالا/پایین/حجم ۲۴ ساعته، نمودار پای ترکیب دارایی |
| 🛒 **معامله امن ۴ مرحله‌ای** | مرحله ۱: پارامترها با اعتبارسنجی زنده محدودیت‌های بازار و موجودی ← مرحله ۲: قیمت خصوصی با **شمارش معکوس TTL ۳۰ ثانیه** (انقضا = غیرفعال شدن ثبت) ← مرحله ۳: خلاصه کامل، هشدار مبلغ بالا، چک‌باکس پذیرش ریسک، تایپ عبارت تأیید + شمارش ۵ ثانیه ← مرحله ۴: ثبت با `clientId` یکتا و پیگیری وضعیت |
| 🔐 **رمز عبور + 2FA** | اولین اجرا الزاماً رمز عبور می‌سازد و بلافاصله فعال‌سازی 2FA را پیشنهاد می‌دهد — **هم QR کد و هم راش دستی نمایش داده می‌شود**؛ سازگار با Google/Microsoft Authenticator، Authy، Aegis و 1Password. ۸ کد پشتیبان یک‌بارمصرف |
| ⏱️ **نشست ۱ ساعته** | انقضای مطلق سمت سرور با شمارش معکوس زنده در هدر، خروج خودکار، خروج خودکار بعد از بی‌فعالیتی (قابل تنظیم) و «خروج از همه دستگاه‌ها» |
| 🛡️ **امنیت سخت‌گیرانه** | هش رمز با PBKDF2-SHA256 (۱۰۰ هزار تکرار)، محدودسازی نرخ و قفل بر اساس IP برای ورود/کد 2FA، دفاع دوگانه CSRF (هدر سفارشی + بررسی Origin)، CSP سختگیرانه و هدرهای امنیتی کامل، `no-store` روی همه پاسخ‌های API |
| 📜 **تاریخچه سفارشات** | تاریخچه محلی با فیلتر (حساب/بازار/سمت/وضعیت)، افزودن دستی `orderId` برای سفارش‌های خارج از اپ، به‌روزرسانی جزئیات از API |
| 🌗 **رابط فارسی RTL** | کاملاً ریسپانسیو با تم تاریک/روشن، فونت وزیرمتن (میزبانی محلی)، اعداد فارسی یا انگلیسی، Pull-to-Refresh موبایل، دسترس‌پذیری کامل (ARIA + کیبورد) |
| ⚡ **اجرای لبه‌ای** | یک Worker + D1: تأخیر پایین جهانی، کش ۱۰ ثانیه‌ای بازارها در حافظه، دریافت موازی موجودی، بدون سرویس خارجی |

## 🏗️ معماری

```
┌──────────────────────────┐            ┌────────────────────────────────┐
│   مرورگر (SPA فارسی RTL)  │   HTTPS    │   Cloudflare Worker (Hono)     │
│   Vite + React 19        │ ─────────► │   ├─ احراز هویت: رمز + TOTP     │
│   Zustand + Recharts     │  کوکی نشست │   ├─ نشست‌ها (۱ ساعته، هش‌شده)   │
│   ورود/2FA/ویزارد معامله │            │   ├─ محدودسازی نرخ (D1)        │
└──────────────────────────┘            │   ├─ هدرهای امنیتی + CSRF       │
                                        │   └─ گاوصندوق توکن AES-256-GCM  │
                                        │            │                   │
                                        │      D1 (SQLite) ◄─────────────┤
                                        └────────────┬───────────────────┘
                                                     │ فقط سمت سرور
                                          ┌──────────▼───────────┐
                                          │   API رسمی وال‌گلد     │
                                          │   api.wallgold.ir     │
                                          └──────────────────────┘
```

- **توکن‌ها هرگز به مرورگر نمی‌رسند** — همه تماس‌های وال‌گلد توسط Worker پروکسی می‌شوند؛ SPA فقط با مبدا خودش صحبت می‌کند.
- **توکن نشست به‌صورت هش (SHA-256) ذخیره می‌شود** — لو رفتن دیتابیس قابل بازپخش به‌عنوان ورود نیست.
- **تنها مقصد خروجی Worker** آدرس `api.wallgold.ir` است.
- **اسکیما خودکار ساخته می‌شود**: جداول در اولین درخواست به‌صورت idempotent ایجاد می‌شوند — بدون هیچ SQL دستی پس از استقرار.

## 🚀 استقرار روی Cloudflare Workers

### روش ۱ — دکمه Deploy یک‌کلیکی *(پیشنهادی)*

1. روی دکمه زیر کلیک کنید:

   [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/NarimanKhaleghi/wallgold-management)

2. جریان استقرار را با حساب Cloudflare خودتون تأیید کنید (ریپو به یک Worker متصل به Git کلون می‌شود).
3. تنظیمات بیلد را در صورت نمایش تأیید کنید:
   - **Build command:** ‏`npm run build`
   - **Deploy command:** ‏`npx wrangler deploy`
4. دیتابیس D1 به‌صورت خودکار توسط همین جریان ساخته می‌شود (binding با نام `DB`). تمام شد — آدرس `*.workers.dev` خود را باز کنید و ویزارد راه‌اندازی اولیه ظاهر می‌شود.

> 💡 اگر جریان استقرار شما به دیتابیس موجود نیاز داشت، از روش ۳ (CLI) استفاده کنید — فقط ۲ دستور است.

### روش ۲ — اتصال ریپوی GitHub (استقرار خودکار با هر push)

1. در داشبورد Cloudflare: **Workers & Pages → Create → Workers → Import a repository** و ریپوی خودتان را انتخاب کنید.
2. مقدار **Build command** را `npm run build` و **Deploy command** را `npx wrangler deploy` بگذارید.
3. در **Settings → Bindings** یک binding از نوع **D1** با نام `DB` اضافه کنید (در صورت نبود، `wallgold-management` را بسازید).
4. ذخیره و استقرار. از این به بعد هر `git push` به‌طور خودکار منتشر می‌شود.

### روش ۳ — خط فرمان Wrangler

```bash
git clone https://github.com/NarimanKhaleghi/wallgold-management
cd wallgold-management
npm install

# ساخت دیتابیس D1 (یک‌بار) و قرار دادن شناسه چاپ‌شده در wrangler.toml
npx wrangler d1 create wallgold-management

# بیلد فرانت‌اند و استقرار Worker
npm run deploy
```

دستور `npm run deploy` یعنی `vite build` + `wrangler deploy` — Worker بک‌اند را باندل و پوشه `dist/` را به‌عنوان فایل‌های استاتیک آپلود می‌کند.

### روش ۴ — GitHub Actions

یک ورک‌فلوی آماده در `.github/workflows/deploy.yml` وجود دارد. این دو Secret را به ریپو اضافه کنید و روی `main` پوش کنید:

| Secret | مقدار |
|---|---|
| `CLOUDFLARE_API_TOKEN` | توکن با دسترسی *Workers Scripts:Edit* + *D1:Edit* |
| `CLOUDFLARE_ACCOUNT_ID` | شناسه حساب Cloudflare شما |

### پس از استقرار: Secretها

اپ بدون هیچ تنظیمی کار می‌کند — کلید رمزنگاری در اولین اجرا به‌صورت خودکار تولید و داخل دیتابیس خصوصی D1 شما ذخیره می‌شود. برای بیشترین جداسازی، می‌توانید **قبل از افزودن حساب‌ها** کلید خودتان را تنظیم کنید:

```bash
# تولید کلید ۳۲ بایتی
openssl rand -base64 32

# تنظیم به‌عنوان Secret رمزنگاری‌شده
npx wrangler secret put ENCRYPTION_KEY
```

اگر `ENCRYPTION_KEY` تنظیم شود بر کلید ذخیره‌شده اولویت دارد (حساب‌های افزودن‌شده قبل از آن باید مجدداً افزوده شوند).

<details>
<summary><b>⚙️ تمام متغیرهای پیکربندی</b></summary>

| متغیر / Secret | پیش‌فرض | توضیح |
|---|---|---|
| `DB` *(binding ‏D1)* | — | **اجباری.** اتصال دیتابیس D1 |
| `SESSION_TTL_SECONDS` | `3600` | طول عمر مطلق نشست (حداقل ۶۰ ثانیه). ۳۶۰۰ = یک ساعت |
| `PBKDF2_ITERATIONS` | `100000` | تکرار هش رمز عبور (حداقل ۱۰۰۰۰) |
| `ENCRYPTION_KEY` *(secret)* | تولید خودکار در D1 | کلید ۳۲ بایتی base64 برای رمزنگاری AES-256-GCM توکن‌ها |

</details>

## 💻 توسعه محلی

```bash
git clone https://github.com/NarimanKhaleghi/wallgold-management
cd wallgold-management
npm install

npm run dev        # هر دو را اجرا می‌کند: wrangler dev (API + D1 روی 8787) و vite (روی 5173 با HMR)
```

**http://localhost:5173** را باز کنید — درخواست‌های API به Worker محلی با دیتابیس D1 لوکال (در `.wrangler/state`) پروکسی می‌شوند.

```bash
npm run preview    # بیلد پروداکشن روی پورت 8787
npm run typecheck  # بررسی TypeScript سخت‌گیرانه
npm run totp -- <SECRET>   # تولید کد TOTP از راش base32 (ابزار تست/بازیابی)
```

## 🔌 استفاده از API وال‌گلد

پیاده‌سازی رسمی [WallGold API v1](https://developers.wallgold.ir/fa/docs):

| سرویس | متد | مسیر | احراز هویت |
|---|---|---|---|
| بازارها | GET | `/api/v1/markets` | عمومی |
| موجودی | GET | `/api/v1/account/balances` | Bearer |
| قیمت سفارش | GET | `/api/v1/account/price?symbol&side` | Bearer |
| ثبت سفارش | POST | `/api/v1/account/orders` | Bearer |
| جزئیات سفارش | GET | `/api/v1/account/orders/{orderId}` | Bearer |

نمادها: `GLD_18C_750TMN` (طلای ۱۸ عیار ۷۵۰) و `SLV_925TMN` (نقره ۹۲۵). همه مقادیر بر حسب گرم و به‌صورت رشته با حداکثر ۳ رقم اعشار هستند. TTL سی‌ثانیه‌ای قیمت از **اولین** دریافت شروع می‌شود (با دریافت مجدد تمدید نمی‌شود) — ویزارد معامله بر اساس `priceExpiresAt` شمارش معکوس می‌کند و با انقضا ثبت را مسدود می‌سازد.

## 🛡️ مدل امنیتی

- **احراز هویت**: رمز عبور (PBKDF2-SHA256 با ۱۰۰ هزار تکرار و نمک اختصاصی) + کد TOTP مطابق RFC 6238 (تحمل ±۱ گام) یا کدهای پشتیبان یک‌بارمصرف. اولین اجرا الزاماً رمز می‌سازد؛ فعال‌سازی 2FA بلافاصله پیشنهاد و بعداً هم از تنظیمات قابل انجام است.
- **نشست‌ها**: توکن تصادفی ۲۵۶ بیتی، ذخیره‌شده به‌صورت **هش SHA-256**، کوکی `HttpOnly` + `SameSite=Strict` + `Secure`، انقضای مطلق ۱ ساعته، پاک‌سازی تنبل، ابطال با تغییر رمز.
- **محدودسازی نرخ**: ۵ ورود ناموفق / ۱۰ دقیقه / IP ← قفل ۱۵ دقیقه؛ ۱۰ کد 2FA ناموفق / ۵ دقیقه / IP ← قفل.
- **گاوصندوق توکن**: توکن‌های وال‌گلد با AES-256-GCM رمزنگاری می‌شوند؛ کلید از Secret ‏`ENCRYPTION_KEY` یا تولید خودکار در D1 (فقط از طریق Worker خودتان قابل دسترسی).
- **ضد CSRF**: کوکی `SameSite=Strict` + هدر الزامی `X-Requested-With` + بررسی Origin روی همه درخواست‌های تغییردهنده.
- **هدرها**: CSP سختگیرانه (`script-src 'self'`، بدون اسکریپت درون‌خطی)، `X-Frame-Options: DENY`، ‏`nosniff`، ‏`Referrer-Policy: no-referrer`، ‏`Permissions-Policy` قفل، ‏HSTS و `Cache-Control: no-store` روی همه پاسخ‌های API.
- **اعتبارسنجی ورودی**: بررسی دقیق سمت سرور همه فیلدها (مقدار تا ۳ اعشار، محدودیت‌های بازار، `minNotional`، وضعیت بازار، موجودی) قبل از ثبت هر سفارش؛ سقف حجم بدنه درخواست.
- **بدون نشت داده**: توکن/رمز هرگز لاگ نمی‌شوند، هرگز در پاسخ API برنمی‌گردند و تنها میزبان خروجی `api.wallgold.ir` است.

جزئیات عملیاتی در [SECURITY.md](SECURITY.md).

## 🧰 عیب‌یابی

| مشکل | راه‌حل |
|---|---|
| ورود روی **پلن رایگان** Workers با خطای CPU شکست می‌خورد | PBKDF2 (۱۰۰ هزار تکرار) ممکن است از سقف ۱۰ms پلن رایگان عبور کند. متغیر `PBKDF2_ITERATIONS=50000` را تنظیم کنید یا از پلن Paid استفاده کنید |
| پیام «اتصال به دیتابیس D1 برقرار نشد» در اولین بار | binding ‏`DB` را در تنظیمات Worker اضافه کنید (یا `database_id` درست را در `wrangler.toml` بگذارید) |
| بازارها لود نمی‌شوند | دسترسی Worker به `api.wallgold.ir` را بررسی کنید (فایروال/شبکه نباید آن را بسته باشد) |
| گم شدن گوشی Authenticator و کدهای پشتیبان | ردیف‌های `auth.password_hash`، ‏`auth.totp_secret` و `auth.totp_enabled` را از جدول `app_settings` در D1 پاک کنید — راه‌اندازی اولیه دوباره اجرا می‌شود (حساب‌ها می‌مانند) |
| فراموشی کامل رمز عبور | همان راه‌حل بالا — پاک کردن `auth.password_hash` از D1 و اجرای مجدد راه‌اندازی |

## ❓ سوالات متداول

**چرا بعد از ۱ ساعت خودکار خارج می‌شوم؟**
طراحی عمدی — نشست‌ها مطلق و سمت سرور اعمال می‌شوند و قابل تمدید نیستند. دوباره وارد شوید؛ با 2FA فقط ۵ ثانیه طول می‌کشد.

**می‌توانم برای چند کاربر اجرا کنم؟**
این اپ تک‌کاربر است (یک رمز، یک 2FA). برای خانواده/تیم، نمونه‌های جداگانه مستقر کنید.

**توکن‌های وال‌گلد من دقیقاً کجا ذخیره می‌شوند؟**
رمزنگاری‌شده (AES-256-GCM) داخل دیتابیس D1 خصوصی خودتان، قابل رمزگشایی فقط توسط نمونه Worker شما.

**آیا ثبت سفارش هزینه دارد؟**
وال‌گلد کارمزد OTC خودش را اعمال می‌کند (`otcFeeCoefficient` — قبل از تأیید در ویزارد نمایش داده می‌شود). این اپ هیچ چیزی اضافه نمی‌کند.

## 🤝 مشارکت

Issue و Pull Request خوش‌آمد است — به‌ویژه بازبینی امنیتی، چندزبانه‌سازی و قابلیت‌های جدید (هشدار قیمت، PWA آفلاین).

## ⚖️ مجوز

MIT © [نریمان خالقی](https://github.com/NarimanKhaleghi) — متن کامل در [LICENSE](LICENSE).

**سلب مسئولیت:** این پروژه وابستگی به وال‌گلد ندارد. معامله طلا/نقره ریسک دارد؛ نویسندگان هیچ مسئولیتی در قبال زیان مالی نمی‌پذیرند. همیشه جزئیات سفارش را قبل از تأیید بررسی کنید.
