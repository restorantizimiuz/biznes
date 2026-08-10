// Telegram WebApp JS SDK (index.html'dagi <script> orqali yuklanadi) uchun
// minimal TypeScript tavsifi — bizga kerakli qismlar bilan cheklangan.
interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; username?: string; first_name?: string } };
  ready: () => void;
  expand: () => void;
  colorScheme: 'light' | 'dark';
  themeParams: TelegramThemeParams;
  viewportStableHeight: number;
  isExpanded: boolean;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  MainButton: {
    text: string;
    setText: (text: string) => void;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  HapticFeedback?: {
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    selectionChanged: () => void;
  };
  close: () => void;
  // Telegram'ning o'zi taqdim etadigan native QR-skaner popup'i (Bot API 6.4+).
  // Callback `true` qaytarsa popup avtomatik yopiladi, `false`/undefined qaytarsa
  // ochiq qoladi (masalan noto'g'ri QR skanerlansa, qayta urinish uchun).
  showScanQrPopup?: (params: { text?: string }, callback?: (text: string) => boolean | void) => void;
  closeScanQrPopup?: () => void;
  onEvent: (eventType: 'scanQrPopupClosed' | 'themeChanged' | 'viewportChanged', callback: () => void) => void;
  offEvent: (eventType: 'scanQrPopupClosed' | 'themeChanged' | 'viewportChanged', callback: () => void) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

// Haqiqiy Telegram ilovasi ichida ishlayotganimizni tekshirish uchun ishonchli
// signal — WebApp skripti oddiy brauzerda ham yuklanadi, lekin `initData`
// faqat botdan chinakam ochilganda to'ldiriladi.
export function isRunningInTelegram(tg: TelegramWebApp | null): boolean {
  return Boolean(tg?.initData);
}
