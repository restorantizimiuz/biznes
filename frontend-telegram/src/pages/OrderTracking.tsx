import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getWebOrderStatus } from '../api';
import type { TrackedOrder } from '../types';
import { formatMoney } from '../utils/format';
import EmptyState from '../components/EmptyState';

/**
 * BUYURTMA HOLATINI KUZATISH.
 *
 * Mijoz buyurtma bergandan keyin shu sahifaga tushadi. Havola `public_token`
 * ustiga qurilgan — buyurtma ID'si emas: ID boshqa endpointlarda ham
 * ishlatiladi va uni ommaga berish kerak emas.
 *
 * Holatni kassir belgilaydi (kassa panelidagi bosqich tugmalari), bu sahifa
 * esa har 5 soniyada yangilanadi. WebSocket ishlatilmadi: mijoz sahifasi
 * qisqa muddat ochiq turadi va so'rov juda yengil — ulanishni boshqarish
 * murakkabligi bu yerda o'zini oqlamaydi.
 */

const REFRESH_MS = 5000;

type Step = { key: string; label: string; emoji: string };

const STEPS_DELIVERY: Step[] = [
  { key: 'new', label: 'Qabul qilinishi kutilmoqda', emoji: '⏳' },
  { key: 'accepted', label: 'Qabul qilindi', emoji: '✅' },
  { key: 'preparing', label: 'Tayyorlanmoqda', emoji: '👨‍🍳' },
  { key: 'ready', label: 'Tayyor', emoji: '🍽️' },
  { key: 'delivering', label: 'Kuryerga berildi', emoji: '🚚' },
  { key: 'delivered', label: 'Yetkazildi', emoji: '📦' },
];

const STEPS_PICKUP: Step[] = [
  { key: 'new', label: 'Qabul qilinishi kutilmoqda', emoji: '⏳' },
  { key: 'accepted', label: 'Qabul qilindi', emoji: '✅' },
  { key: 'preparing', label: 'Tayyorlanmoqda', emoji: '👨‍🍳' },
  { key: 'ready', label: 'Olib ketishga tayyor', emoji: '🥡' },
];

/**
 * Bazadagi ikkita ustunni (status va kitchen_status) mijozga ko'rinadigan
 * bitta bosqichga aylantiradi.
 */
function currentStepKey(order: TrackedOrder): string {
  if (order.status === 'new') return 'new';
  if (order.status === 'cancelled') return 'cancelled';
  if (order.status === 'paid') return 'done';
  // status === 'activated' — endi tayyorlash bosqichi hal qiladi.
  return order.kitchen_status;
}

export default function OrderTracking() {
  const { token = '' } = useParams();
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const load = () =>
      getWebOrderStatus(token)
        .then((data) => {
          if (cancelled) return;
          setOrder(data);
          setFailed(false);
        })
        .catch(() => {
          // Faqat birinchi so'rov muvaffaqiyatsiz bo'lsa xato ko'rsatamiz.
          // Keyingi so'rov uzilishi vaqtinchalik bo'lishi mumkin — ekrandagi
          // ma'lumotni yo'qotib yubormaymiz.
          if (!cancelled) setFailed((prev) => prev || order === null);
        });

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (failed && !order) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
        <EmptyState emoji="😕" title="Buyurtma topilmadi" subtitle="Havola noto'g'ri bo'lishi mumkin" isError />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)]">
        <p className="text-[14px] text-[var(--color-text-secondary)]">Yuklanmoqda...</p>
      </div>
    );
  }

  const stepKey = currentStepKey(order);
  const steps = order.order_type === 'delivery' ? STEPS_DELIVERY : STEPS_PICKUP;
  const activeIndex = steps.findIndex((s) => s.key === stepKey);

  return (
    <div className="mx-auto min-h-screen max-w-[560px] bg-[var(--color-bg)] px-4 pb-10">
      <header className="pb-4" style={{ paddingTop: 'calc(var(--safe-top) + 20px)' }}>
        <h1 className="text-[20px] font-bold text-[var(--color-text)]">{order.business_name}</h1>
        <p className="text-[13px] text-[var(--color-text-secondary)]">
          {order.order_type === 'delivery' ? 'Yetkazib berish' : 'Olib ketish'} · {order.customer_name}
        </p>
      </header>

      {order.status === 'cancelled' ? (
        <div className="rounded-[var(--radius-md)] bg-red-500/10 p-4 text-center">
          <p className="text-2xl">❌</p>
          <p className="mt-1 text-[15px] font-semibold text-[var(--color-danger)]">
            Buyurtma bekor qilindi
          </p>
          <p className="mt-1 text-[12.5px] text-[var(--color-text-secondary)]">
            Batafsil ma'lumot uchun restoranga qo'ng'iroq qiling.
          </p>
        </div>
      ) : order.status === 'paid' ? (
        <div className="rounded-[var(--radius-md)] bg-emerald-500/10 p-4 text-center">
          <p className="text-2xl">🎉</p>
          <p className="mt-1 text-[15px] font-semibold text-[var(--color-text)]">
            Buyurtma yakunlandi
          </p>
          <p className="mt-1 text-[12.5px] text-[var(--color-text-secondary)]">
            Bizni tanlaganingiz uchun rahmat!
          </p>
        </div>
      ) : (
        <ol className="space-y-2">
          {steps.map((step, index) => {
            const done = activeIndex >= 0 && index < activeIndex;
            const active = index === activeIndex;
            return (
              <li
                key={step.key}
                className={`flex items-center gap-3 rounded-[var(--radius-md)] p-3 transition ${
                  active
                    ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)] shadow-[var(--shadow-md)]'
                    : 'bg-[var(--color-surface)]'
                }`}
              >
                <span className={`text-xl ${!active && !done ? 'opacity-35' : ''}`}>
                  {done ? '✓' : step.emoji}
                </span>
                <span
                  className={`text-[14.5px] font-medium ${
                    active
                      ? ''
                      : done
                        ? 'text-[var(--color-text)]'
                        : 'text-[var(--color-text-secondary)] opacity-60'
                  }`}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <section className="mt-5 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-2 text-[13px] font-semibold text-[var(--color-text-secondary)]">
          Buyurtma tarkibi
        </h2>
        {order.items.map((item, index) => (
          <div key={index} className="flex justify-between py-1 text-[14px]">
            <span className="text-[var(--color-text)]">
              {item.product_name} × {item.quantity}
            </span>
            <span className="text-[var(--color-text-secondary)]">
              {formatMoney(item.unit_price * item.quantity)}
            </span>
          </div>
        ))}
        {order.discount_amount > 0 && (
          <div className="flex justify-between border-t border-[var(--color-border)] pt-2 text-[13px] text-[var(--color-text-secondary)]">
            <span>Chegirma</span>
            <span>−{formatMoney(order.discount_amount)}</span>
          </div>
        )}
        <div className="mt-2 flex justify-between border-t border-[var(--color-border)] pt-2 text-[15px] font-bold text-[var(--color-text)]">
          <span>Jami</span>
          <span>{formatMoney(order.final_amount)} so'm</span>
        </div>
      </section>

      {order.delivery_address && (
        <section className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4 text-[13px]">
          <p className="text-[var(--color-text)]">📍 {order.delivery_address}</p>
          {order.delivery_note && (
            <p className="mt-1 text-[var(--color-text-secondary)]">💬 {order.delivery_note}</p>
          )}
        </section>
      )}

      <p className="mt-5 text-center text-[12px] text-[var(--color-text-secondary)]">
        Bu sahifa har 5 soniyada avtomatik yangilanadi.
      </p>

      <div className="mt-3 text-center">
        <Link
          to={`/menyu/${order.business_code}`}
          className="text-[13px] font-medium text-[var(--color-accent)] hover:underline"
        >
          Menyuga qaytish
        </Link>
      </div>
    </div>
  );
}
