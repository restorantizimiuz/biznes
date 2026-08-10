// Telegram WebApp JS SDK (index.html'dagi <script> orqali yuklanadi) uchun
// minimal TypeScript tavsifi — bizga kerakli qismlar bilan cheklangan.
interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; username?: string; first_name?: string } };
  ready: () => void;
  expand: () => void;
  colorScheme: 'light' | 'dark';
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
  HapticFeedback?: {
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
  };
  close: () => void;
  // Telegram'ning o'zi taqdim etadigan native QR-skaner popup'i (Bot API 6.4+).
  // Callback `true` qaytarsa popup avtomatik yopiladi, `false`/undefined qaytarsa
  // ochiq qoladi (masalan noto'g'ri QR skanerlansa, qayta urinish uchun).
  showScanQrPopup?: (params: { text?: string }, callback?: (text: string) => boolean | void) => void;
  closeScanQrPopup?: () => void;
  onEvent: (eventType: 'scanQrPopupClosed', callback: () => void) => void;
  offEvent: (eventType: 'scanQrPopupClosed', callback: () => void) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}
