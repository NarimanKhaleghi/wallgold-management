/**
 * روت‌های مدیریت حساب‌های وال‌گلد (همه نیازمند نشست معتبر)
 *
 * - GET    /api/accounts       لیست حساب‌ها (بدون توکن)
 * - POST   /api/accounts       افزودن حساب (توکن ابتدا اعتبارسنجی سپس رمزنگاری‌شده ذخیره می‌شود)
 * - PATCH  /api/accounts/:id   ویرایش نام / وضعیت نمایش
 * - DELETE /api/accounts/:id   حذف حساب و سفارشات ردیابی‌شده آن
 * - POST   /api/accounts/:id/test  تست اتصال (رفع باگ نسخه قبلی که این روت را نداشت)
 */

import { Hono, type Context } from "hono";
import type { AppBindings } from "../env";
import type { AccountRow } from "../db";
import { publicAccount, getMasterKey, nowMs } from "../db";
import { aesGcmEncrypt, aesGcmDecrypt } from "../crypto";
import { wgGetBalances } from "../wallgold";

export const accountRoutes = new Hono<AppBindings>();

async function readJson(c: Context<AppBindings>): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

async function getAccount(c: Context<AppBindings>, id: string): Promise<AccountRow | null> {
  return c.env.DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(id).first<AccountRow>();
}

/** رمزگشایی توکن حساب — در صورت خرابی خطای ساختارافته */
async function extractToken(c: Context<AppBindings>, acc: AccountRow): Promise<string> {
  const masterKey = await getMasterKey(c.env.DB, c.env.ENCRYPTION_KEY);
  const token = await aesGcmDecrypt(masterKey, acc.token_enc);
  if (!token) throw new Error("TOKEN_DECRYPT_FAILED");
  return token;
}

/* --------------------------------- لیست --------------------------------- */

accountRoutes.get("/", async (c) => {
  const rows = await c.env.DB
    .prepare("SELECT * FROM accounts ORDER BY created_at ASC")
    .all<AccountRow>();
  return c.json({ success: true, accounts: rows.results.map(publicAccount) });
});

/* -------------------------------- افزودن -------------------------------- */

accountRoutes.post("/", async (c) => {
  const body = await readJson(c);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";

  if (!name) return c.json({ success: false, message: "نام حساب الزامی است." }, 400);
  if (name.length > 60) return c.json({ success: false, message: "نام حساب حداکثر ۶۰ کاراکتر می‌تواند باشد." }, 400);
  if (!token || token.length < 10) return c.json({ success: false, message: "توکن API نامعتبر است." }, 400);

  // اعتبارسنجی توکن با فراخوانی سرویس موجودی وال‌گلد
  try {
    await wgGetBalances(token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطای نامشخص";
    return c.json({ success: false, message: `توکن تأیید نشد: ${msg}` }, 400);
  }

  // جلوگیری از افزودن توکن تکراری
  const existing = await c.env.DB.prepare("SELECT id, name, token_enc FROM accounts").all<{
    id: string;
    name: string;
    token_enc: string;
  }>();
  const masterKey = await getMasterKey(c.env.DB, c.env.ENCRYPTION_KEY);
  for (const acc of existing.results) {
    const existingToken = await aesGcmDecrypt(masterKey, acc.token_enc);
    if (existingToken === token) {
      return c.json({ success: false, message: `این توکن قبلاً برای حساب «${acc.name}» ثبت شده است.` }, 400);
    }
  }

  const id = crypto.randomUUID();
  const now = nowMs();
  await c.env.DB
    .prepare(
      "INSERT INTO accounts (id, name, token_enc, visible, last_check_ok, last_check_msg, last_checked_at, created_at, updated_at) " +
        "VALUES (?, ?, ?, 1, 1, ?, ?, ?, ?)"
    )
    .bind(id, name, await aesGcmEncrypt(masterKey, token), "توکن معتبر است.", now, now, now)
    .run();

  const acc = await getAccount(c, id);
  return c.json({ success: true, account: acc ? publicAccount(acc) : null }, 201);
});

/* -------------------------------- ویرایش -------------------------------- */

accountRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const acc = await getAccount(c, id);
  if (!acc) return c.json({ success: false, message: "حساب مورد نظر پیدا نشد." }, 404);

  const body = await readJson(c);
  let name = acc.name;
  let visible = acc.visible;

  if (body.name !== undefined) {
    const n = typeof body.name === "string" ? body.name.trim() : "";
    if (!n) return c.json({ success: false, message: "نام حساب نمی‌تواند خالی باشد." }, 400);
    if (n.length > 60) return c.json({ success: false, message: "نام حساب حداکثر ۶۰ کاراکتر می‌تواند باشد." }, 400);
    name = n;
  }
  if (body.visible !== undefined) visible = body.visible ? 1 : 0;

  await c.env.DB
    .prepare("UPDATE accounts SET name = ?, visible = ?, updated_at = ? WHERE id = ?")
    .bind(name, visible, nowMs(), id)
    .run();

  const updated = await getAccount(c, id);
  return c.json({ success: true, account: updated ? publicAccount(updated) : null });
});

/* --------------------------------- حذف --------------------------------- */

accountRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const acc = await getAccount(c, id);
  if (!acc) return c.json({ success: false, message: "حساب مورد نظر پیدا نشد." }, 404);

  // حذف دستی سفارشات ردیابی‌شده (D1 کلید خارجی را تضمین نمی‌کند)
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM tracked_orders WHERE account_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM accounts WHERE id = ?").bind(id),
  ]);
  return c.json({ success: true, deleted: true });
});

/* ----------------------------- تست اتصال ----------------------------- */

accountRoutes.post("/:id/test", async (c) => {
  const id = c.req.param("id");
  const acc = await getAccount(c, id);
  if (!acc) return c.json({ success: false, message: "حساب مورد نظر پیدا نشد." }, 404);

  try {
    const token = await extractToken(c, acc);
    await wgGetBalances(token);
    await c.env.DB
      .prepare("UPDATE accounts SET last_check_ok = 1, last_check_msg = ?, last_checked_at = ?, updated_at = ? WHERE id = ?")
      .bind("اتصال موفق — توکن معتبر است.", nowMs(), nowMs(), id)
      .run();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطای نامشخص";
    await c.env.DB
      .prepare("UPDATE accounts SET last_check_ok = 0, last_check_msg = ?, last_checked_at = ?, updated_at = ? WHERE id = ?")
      .bind(msg, nowMs(), nowMs(), id)
      .run();
    return c.json({ success: false, message: `تست اتصال ناموفق: ${msg}` }, 200);
  }

  const updated = await getAccount(c, id);
  return c.json({
    success: true,
    account: updated ? publicAccount(updated) : null,
    message: "اتصال موفق — توکن معتبر است.",
  });
});
