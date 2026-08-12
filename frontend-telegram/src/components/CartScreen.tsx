import type { CartLine } from '../types';
import { formatMoney } from '../utils/format';
import CartItem from './CartItem';
import EmptyState from './EmptyState';

type CheckoutMessage = { type: 'error' | 'info'; text: string };

/**
 * Savat — **faqat stol rejimi** uchun (Telegram WebApp).
 *
 * Buyurtma turi tanlovi (stolga / yetkazib berish / olib ketish) bu yerdan
 * olib tashlandi: mijoz allaqachon stolda o'tiribdi va tokeni havolada bor,
 * shuning uchun tanlov faqat chalg'itardi. Uydan buyurtma endi ochiq veb
 * sahifada — pages/WebCheckout.tsx.
 */
export default function CartScreen({
  lines,
  total,
  submitting,
  checkoutMessage,
  tableName,
  onBack,
  onIncrement,
  onDecrement,
  onSubmit,
}: {
  lines: CartLine[];
  total: number;
  submitting: boolean;
  checkoutMessage: CheckoutMessage | null;
  tableName?: string;
  onBack: () => void;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onSubmit: () => void;
}) {
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
            {`${tableName || 'Stolingiz'}ga qo'shiladi`}
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
            disabled={submitting}
            className="flex h-13 w-full items-center justify-center rounded-full bg-[var(--color-accent)] py-3.5 text-[16px] font-semibold text-[var(--color-accent-text)] shadow-[var(--shadow-md)] transition active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? 'Yuborilmoqda...' : 'Buyurtma berish'}
          </button>
        </div>
      )}
    </div>
  );
}
