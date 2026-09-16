/**
 * ساخت QR برای راه‌اندازی 2FA — کاملاً سمت مرورگر (بدون سرویس خارجی)
 */
import QRCode from "qrcode";

export async function qrDataUrl(text: string, size = 220): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
}
