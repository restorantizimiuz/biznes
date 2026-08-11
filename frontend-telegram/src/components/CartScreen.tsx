import { useState } from 'react';
import type { CartLine, OrderType } from '../types';
import { formatMoney } from '../utils/format';
import CartItem from './CartItem';
import EmptyState from './EmptyState';

type CheckoutMessage = { type: 'error' | 'info'; text: string };

const ORDER_TYPES: { id: OrderType; emoji: string; label: string; hint: string }[] = [
  { id: 'dine_in', emoji: '🍽️', label: 'Stolga', hint: 'Stol QR kodi skanerlanadi' },
  { id: 'delivery', emoji: '🚚', label: 'Yetkazib berish', hint: 'Telefon va manzil kerak' },
  { id: 'pickup', emoji: '🥡', label: 'Olib ketish', hint: 'Telefon raqamingiz kerak' },
];

// Savat + checkout bitta ekranda: mahsulotlarni ko'rib chiqish, buyurtma turini
// tanlash, so'ng yuborish. "Stolga" turida App.tsx Telegram QR-skanerini ochadi,
// qolgan ikkisida telefon (va yetkazib berishda manzil) shu yerda so'raladi.
export default function CartScreen({
  lines,
  total,
  scanning,
  submitting,
  checkoutMessage,
  lockedToTable,
  tableName,
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
  // Stol ma'lum bo'lsa (QR havolasi orqali kirilgan yoki skanerlangan) tur
  // tanlovi ko'rsatilmaydi — mijoz stolda o'tiribdi va shunchaki taom
  // qo'shmoqda. Yetkazib berish/olib ketish maydonlari uni chalg'itardi.
  lockedToTable: boolean;
  tableName?: string;
  onBack: () => void;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onSubmit: (orderType: OrderType, phone: string, address: string) => void;
}) {
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const effectiveType: OrderType = lockedToTable ? 'dine_in' : orderType;
  const busy = scanning || submitting;

  let buttonText = 'Buyurtma berish';
  if (scanning) buttonText = 'QR kod skanerlanmoqda...';
  else if (submitting) buttonText = 'Yuborilmoqda...';

  function handleSubmit() {
    setFormError(null);
    if (effectiveType !== 'dine_in') {
      if (!phone.trim()) {
        setFormError('Telefon raqamingizni kiriting');
        return;
      }
      if (effectiveType === 'delivery' && !address.trim()) {
        setFormError('Yetkazib berish manzilini kiriting');
        return;
      }
    }
    onSubmit(effectiveType, phone.trim(), address.trim());
  }

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
            {lockedToTable
              ? `${tableName || 'Stolingiz'}ga qo'shiladi`
              : 'Buyurtma turini tanlang'}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4">
        {lines.length === 0 ? (
          <EmptyState emoji="🛒" title="Savat bo'sh" subtitle="Menyudan mahsulot tanlang" />
        ) : (
          <>
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

            {!lockedToTable && (
              <div className="mt-4 space-y-2">
                {ORDER_TYPES.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setOrderType(type.id)}
                    className={`flex w-full items-center gap-3 rounded-[var(--radius-md)] border-2 p-3 text-left transition ${
                      orderType === type.id
                        ? 'border-[var(--color-accent)] bg-[var(--color-surface)]'
                        : 'border-transparent bg-[var(--color-surface)]'
                    }`}
                  >
                    <span className="text-2xl">{type.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-[var(--color-text)]">
                        {type.label}
                      </p>
                      <p className="text-[12px] text-[var(--color-text-secondary)]">{type.hint}</p>
                    </div>
                    {orderType === type.id && (
                      <span className="text-[var(--color-accent)]">✓</span>
                    )}
                  </button>
                ))}

                {orderType !== 'dine_in' && (
                  <div className="space-y-2 pt-1">
                    <input
                      type="tel"
                      inputMode="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Telefon raqamingiz (+998 ...)"
                      className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[14px] text-[var(--color-text)] outline-none"
                    />
                    {orderType === 'delivery' && (
                      <textarea
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        rows={2}
                        placeholder="Yetkazib berish manzili"
                        className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[14px] text-[var(--color-text)] outline-none"
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </>
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
          {(formError || checkoutMessage) && (
            <p
              className={`mb-3 rounded-[var(--radius-sm)] px-3 py-2 text-[13px] ${
                formError || checkoutMessage?.type === 'error'
                  ? 'bg-red-500/10 text-[var(--color-danger)]'
                  : 'bg-[var(--color-border)] text-[var(--color-text-secondary)]'
              }`}
            >
              {formError ?? checkoutMessage?.text}
            </p>
          )}
          <button
            onClick={handleSubmit}
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
