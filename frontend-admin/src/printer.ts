import type { Receipt } from './api/types';

// Kassir kompyuterida ixtiyoriy ravishda ishga tushirilgan lokal chek-printer
// yordamchi dasturi (printer-helper/) shu manzilda tinglaydi. U yo'q yoki
// o'chirilgan bo'lsa, bu funksiya shunchaki false qaytaradi va chaqiruvchi
// kod chekni Telegram orqali yuborishga o'tadi.
const PRINTER_HELPER_BASE = 'http://127.0.0.1:9123';
const REQUEST_TIMEOUT_MS = 1500;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Chekni lokal printerga yuborish.
 *
 * Chek ma'lumoti bilan birga kafe printer sozlamalari ham ketadi (receipt.printer) —
 * shuning uchun kassir sozlamani Sozlamalar bo'limidan o'zgartirsa, printer-helper
 * .env faylini tahrirlash shart emas.
 */
export async function tryPrintReceipt(receipt: Receipt): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${PRINTER_HELPER_BASE}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(receipt),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Printer yordamchi dasturi ishlab turibdimi.
 *
 * Kassa paneli buni davriy tekshiradi va "printer ulanmagan" belgisini
 * ko'rsatadi — shunda kassir chek chiqmasligini to'lov paytida emas, oldindan
 * biladi.
 */
export async function checkPrinterHealth(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${PRINTER_HELPER_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
