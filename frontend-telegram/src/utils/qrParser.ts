// Stol QR kodi backend tomonidan aynan shu formatda generatsiya qilinadi
// (backend/internal/handlers/tables.go, GetTableQRCode):
//
//   https://t.me/<bot_username>?start=table_<table_token>
//
// Bu yerda skanerlangan matnni QAT'IY tekshiramiz — oddiy "table_" qidirish
// (avvalgi versiyada bo'lgani kabi) YETARLI EMAS, chunki bu holda har qanday
// matn ichida tasodifan "table_xxx" so'zi uchrasa ham qabul qilinaverar edi.
// Endi: (1) haqiqiy URL bo'lishi, (2) domen aynan t.me bo'lishi, (3) agar bizning
// bot username ma'lum bo'lsa — QR aynan shu botga tegishli bo'lishi (boshqa
// restoran/bot QR kodi rad etiladi) shart.
export type ParsedTableQr =
  | { ok: true; tableToken: string }
  | { ok: false; reason: 'invalid_format' | 'wrong_bot' };

export function parseTableQr(scannedText: string, expectedBotUsername?: string): ParsedTableQr {
  let url: URL;
  try {
    url = new URL(scannedText.trim());
  } catch {
    return { ok: false, reason: 'invalid_format' };
  }

  if (url.hostname.toLowerCase() !== 't.me') {
    return { ok: false, reason: 'invalid_format' };
  }

  const pathBotUsername = url.pathname.replace(/^\/+/, '').split('/')[0] ?? '';
  if (expectedBotUsername && pathBotUsername.toLowerCase() !== expectedBotUsername.toLowerCase()) {
    return { ok: false, reason: 'wrong_bot' };
  }

  const startParam = url.searchParams.get('start');
  if (!startParam || !startParam.startsWith('table_')) {
    return { ok: false, reason: 'invalid_format' };
  }

  const tableToken = startParam.slice('table_'.length);
  if (!/^[0-9a-fA-F-]{8,}$/.test(tableToken)) {
    return { ok: false, reason: 'invalid_format' };
  }

  return { ok: true, tableToken };
}
