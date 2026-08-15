/**
 * Stol QR kodini o'qish.
 *
 * Har bir stol QR kodi Telegram chuqur havolasi sifatida generatsiya
 * qilinadi (backend: handlers/tables.go GetTableQRCode):
 *
 *   https://t.me/<bot_username>?start=table_<token>
 *
 * Mijoz "Stol uchun buyurtma" tugmasini bosganda Telegram'ning o'z QR
 * skaneri ochiladi (Telegram.WebApp.showScanQrPopup) va skanerlangan matn
 * shu funksiyaga beriladi. Bot username tekshiruvi ataylab qilinadi: aks
 * holda mijoz boshqa restoranning (boshqa botning) stol QR kodini
 * skanerlab, tasodifan noto'g'ri hisobga/menyuga tushib qolishi mumkin edi.
 */

const EXPECTED_BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME as string | undefined;

/**
 * Skanerlangan matndan stol tokenini ajratadi.
 * Mos kelmasa (boshqa domen, boshqa bot, noto'g'ri format) `null` qaytaradi —
 * chaqiruvchi shu holatda skanerni qayta ochiq qoldirishi kerak.
 */
export function parseTableQrUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  if (url.hostname.toLowerCase() !== 't.me') return null;

  if (!EXPECTED_BOT_USERNAME) return null;
  const scannedUsername = url.pathname.replace(/^\//, '');
  if (scannedUsername.toLowerCase() !== EXPECTED_BOT_USERNAME.toLowerCase()) return null;

  const start = url.searchParams.get('start') ?? '';
  if (!start.startsWith('table_')) return null;

  const token = start.slice('table_'.length).trim();
  return token || null;
}
