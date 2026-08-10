import type { Receipt } from './api/types';

// Kassir kompyuterida ixtiyoriy ravishda ishga tushirilgan lokal chek-printer
// yordamchi dasturi (printer-helper/) shu manzilda tinglaydi. U yo'q yoki
// o'chirilgan bo'lsa, bu funksiya shunchaki false qaytaradi va chaqiruvchi
// kod chekni Telegram orqali yuborishga o'tadi.
const PRINTER_HELPER_URL = 'http://127.0.0.1:9123/print';

export async function tryPrintReceipt(receipt: Receipt): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(PRINTER_HELPER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(receipt),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    return false;
  }
}
