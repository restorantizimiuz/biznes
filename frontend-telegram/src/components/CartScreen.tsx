import type { CartLine } from '../types';
import { formatMoney } from '../utils/format';
import CartItem from './CartItem';
import EmptyState from './EmptyState';

type CheckoutMessage = { type: 'error' | 'info'; text: string };

// Savat + checkout bitta ekranda: mahsulotlarni ko'rib chiqish, keyin "Buyurtma
// berish" bosilganda Telegram'ning o'zining QR-skaneri ochiladi (App.tsx'da
// boshqariladi) — bu yerda faqat skanerlash/yuborish holatlari ko'rsatiladi.
export default function CartScreen({
  lines,
  total,
  scanning,
  submitting,
  checkoutMessage,
  onBack,
  onIncrement,
  onDecrement,
  onSubmit,
}: {
  lines: CartLine[];
  total: number;
  scanning: boolean;
  submitting: boolean;
  checkoutMessage: CheckoutMessage | null;
  onBack: () => void;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onSubmit: () => void;
}) {
  const busy = scanning || submitting;
  let buttonText = 'Buyurtma berish';
  if (scanning) buttonText = 'QR kod skanerlanmoqda...';
  else if (submitting) buttonText = 'Yuborilmoqda...';

  return (
    <div className="animate-fade-in-up fixed inset-0 z-30 flex flex-col bg-[var(--color-bg)]">
      <header
        className="flex shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 pb-3"
        style={{ paddingTop: 'calc(var(--safe-top) + 12px)' }}
      >
        <button
          onClick={onBack}
          aria-label="Orqaga"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface)] text-base shadow-[var(--shadow-sm)] transition active:scale-90"
        >
          ←
        </button>
        <div>
          <h1 className="text-[17px] font-bold text-[var(--color-text)]">Savat</h1>
          <p className="text-[12px] text-[var(--color-text-secondary)]">
            Buyurtma berishda stol QR kodi so'raladi
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4">
        {lines.length === 0 ? (
          <EmptyState emoji="🛒" title="Savat bo'sh" subtitle="Menyudan mahsulot tanlang" />
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {lines.map((line) => (
              <CartItem
                key={line.product.id}
                line={line}
                onIncrement={onIncrement}
                onDecrement={onDecrement}
              />
            ))}
          </div>
        )}
      </div>

      {lines.length > 0 && (
        <div
          className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-bg)] px-4 pt-3"
          style={{ paddingBottom: 'calc(var(--safe-bottom) + 14px)' }}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[15px] font-semibold text-[var(--color-text)]">Jami</span>
            <span className="text-[19px] font-bold text-[var(--color-text)]">
              {formatMoney(total)} so'm
            </span>
          </div>
          {checkoutMessage && (
            <p
              className={`mb-3 rounded-[var(--radius-sm)] px-3 py-2 text-[13px] ${
                checkoutMessage.type === 'error'
                  ? 'bg-red-500/10 text-[var(--color-danger)]'
                  : 'bg-[var(--color-border)] text-[var(--color-text-secondary)]'
              }`}
            >
              {checkoutMessage.text}
            </p>
          )}
          <button
            onClick={onSubmit}
            disabled={busy}
            className="flex h-13 w-full items-center justify-center rounded-full bg-[var(--color-accent)] py-3.5 text-[16px] font-semibold text-[var(--color-accent-text)] shadow-[var(--shadow-md)] transition active:scale-[0.98] disabled:opacity-60"
          >
            {buttonText}
          </button>
        </div>
      )}
    </div>
  );
}
