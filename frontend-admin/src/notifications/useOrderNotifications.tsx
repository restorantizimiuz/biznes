import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSettings, ordersSocketUrl } from '../api/endpoints';
import type { OrderEvent } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { isSoundReady, playNotificationSound, primeNotificationSound } from './sound';

export interface OrderToast {
  id: number;
  event: OrderEvent;
}

interface NotificationsValue {
  toasts: OrderToast[];
  dismiss: (id: number) => void;
  /** WebSocket ulanishi tirikmi (uzilganda 5 soniyalik so'rov zaxira bo'lib qoladi) */
  connected: boolean;
  /** Ovoz brauzer tomonidan bloklanganmi — foydalanuvchiga eslatma ko'rsatiladi */
  soundBlocked: boolean;
  /** Banner bosilganda ochiladigan buyurtma (kassa sahifasi kuzatib turadi) */
  focusOrderId: string | null;
  clearFocus: () => void;
}

const NotificationsContext = createContext<NotificationsValue | undefined>(undefined);

// Ulanish uzilganda qayta ulanish oralig'i. Juda tez urinish serverga keraksiz
// yuk beradi, juda sekin — kassir buyurtmani kech ko'radi.
const RECONNECT_DELAY_MS = 3000;
const TOAST_LIFETIME_MS = 12000;

/**
 * Mijoz buyurtmalari uchun real-time bildirishnoma.
 *
 * Uch xil signal beriladi (talab shunday edi):
 *   1. ovoz — Web Audio bilan,
 *   2. banner — ekran tepasida, bosilganda buyurtma oynasini ochadi,
 *   3. brauzer bildirishnomasi — panel boshqa oynada bo'lganda ham ko'rinadi.
 *
 * Signal **faqat mijoz yuborgan** buyurtmalarda chiqadi (QR yoki Telegram):
 * kassir o'zi kiritgan buyurtma uchun ovoz chiqarish keraksiz shovqin bo'lardi.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { auth } = useAuth();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings });

  const [toasts, setToasts] = useState<OrderToast[]>([]);
  const [connected, setConnected] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [focusOrderId, setFocusOrderId] = useState<string | null>(null);

  // Sozlama o'zgarishi WebSocket'ni qayta ulashga sabab bo'lmasligi kerak,
  // shuning uchun ovoz bayrog'i ref orqali o'qiladi.
  const soundEnabledRef = useRef(true);
  soundEnabledRef.current = settings?.notify_sound ?? true;

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const clearFocus = useCallback(() => setFocusOrderId(null), []);

  // Brauzer autoplay siyosati: birinchi bosishgacha ovoz bloklanadi.
  // Sahifadagi istalgan birinchi bosishda AudioContext ishga tushiriladi.
  useEffect(() => {
    const unlock = () => {
      primeNotificationSound();
      setSoundBlocked(false);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Brauzer bildirishnomasi uchun ruxsat bir marta so'raladi.
  useEffect(() => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  const handleEvent = useCallback(
    (event: OrderEvent) => {
      // Har qanday hodisada ro'yxat yangilanadi — kassir kutmasdan ko'radi.
      queryClient.invalidateQueries({ queryKey: ['active-orders'] });
      queryClient.invalidateQueries({ queryKey: ['tables'] });

      if (!event.from_customer || event.event !== 'new_order') return;

      const id = Date.now() + Math.random();
      setToasts((list) => [...list, { id, event }].slice(-4));
      window.setTimeout(() => dismiss(id), TOAST_LIFETIME_MS);

      if (soundEnabledRef.current) {
        playNotificationSound();
        if (!isSoundReady()) setSoundBlocked(true);
      }

      if ('Notification' in window && Notification.permission === 'granted') {
        const where = event.table_name ? `${event.table_name}` : 'Online';
        new Notification('Yangi buyurtma', {
          body: `${where} — ${(event.amount ?? 0).toLocaleString()}`,
          tag: event.order_id,
        });
      }
    },
    [dismiss, queryClient],
  );

  // WebSocket ulanishi. Uzilsa avtomatik qayta ulanadi; ulanmasa ham kassa
  // paneli 5 soniyalik so'rov bilan ishlashda davom etadi (zaxira yo'l).
  useEffect(() => {
    const token = auth?.token;
    if (!token) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      socket = new WebSocket(ordersSocketUrl(token));

      socket.onopen = () => setConnected(true);
      socket.onmessage = (message) => {
        try {
          handleEvent(JSON.parse(message.data) as OrderEvent);
        } catch {
          // Noto'g'ri formatdagi xabar butun ulanishni buzmasligi kerak.
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (!cancelled) reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      cancelled = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [auth?.token, handleEvent]);

  const value = useMemo<NotificationsValue>(
    () => ({
      toasts,
      dismiss,
      connected,
      soundBlocked,
      focusOrderId,
      clearFocus,
    }),
    [toasts, dismiss, connected, soundBlocked, focusOrderId, clearFocus],
  );

  return (
    <NotificationsContext.Provider value={{ ...value, focusOrderId }}>
      <OrderToastHost
        toasts={toasts}
        onDismiss={dismiss}
        onOpen={(orderId) => {
          setFocusOrderId(orderId);
          setToasts([]);
        }}
      />
      {children}
    </NotificationsContext.Provider>
  );
}

export function useOrderNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useOrderNotifications NotificationsProvider ichida ishlatilishi kerak');
  return ctx;
}

// Bannerlar ekran tepasida turadi va bosilganda o'sha buyurtmani ochadi.
// Alohida faylga ajratilmadi — u faqat shu provider bilan ishlatiladi.
function OrderToastHost({
  toasts,
  onDismiss,
  onOpen,
}: {
  toasts: OrderToast[];
  onDismiss: (id: number) => void;
  onOpen: (orderId: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 p-3">
      {toasts.map(({ id, event }) => (
        <div
          key={id}
          className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 shadow-lg"
        >
          <span className="text-2xl">🔔</span>
          <button
            onClick={() => onOpen(event.order_id)}
            className="min-w-0 flex-1 text-left"
          >
            <p className="text-sm font-semibold text-emerald-900">
              {event.table_name ? `${event.table_name} — yangi buyurtma` : 'Yangi online buyurtma'}
            </p>
            <p className="truncate text-xs text-emerald-700">
              {event.source === 'qr' ? 'QR' : 'Telegram'}
              {event.amount ? ` · ${event.amount.toLocaleString()}` : ''}
            </p>
          </button>
          <button
            onClick={() => onDismiss(id)}
            aria-label="×"
            className="shrink-0 rounded-lg px-2 py-1 text-lg text-emerald-700 hover:bg-emerald-100"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
