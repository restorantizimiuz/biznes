import { formatMoney } from '../utils/format';
import type { ActiveOrder, OrderType } from '../types';

const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  dine_in: 'Stolga',
  delivery: '🚚 Yetkazib berish',
  pickup: '🥡 Olib ketish',
};

// Kassir buyurtmani ko'rgach holatni belgilaydi — mijoz shu yerda kuzatib turadi.
function statusInfo(order: ActiveOrder | null) {
  if (!order) return { emoji: '✅', text: 'Buyurtmangiz qabul qilindi!', tone: 'text-emerald-500' };
  if (order.status === 'new')
    return { emoji: '⏳', text: 'Kassir tasdig\'i kutilmoqda', tone: 'text-amber-500' };
  if (order.kitchen_status === 'ready')
    return { emoji: '🍽️', text: 'Buyurtmangiz tayyor!', tone: 'text-emerald-500' };
  return { emoji: '👨‍🍳', text: 'Buyurtmangiz tayyorlanmoqda', tone: 'text-sky-500' };
}

export default function ConfirmedScreen({
  order,
  fallbackTotal,
  tableName,
  orderType,
  onOrderMore,
}: {
  order: ActiveOrder | null;
  fallbackTotal: number;
  tableName: string;
  orderType: OrderType;
  onOrderMore: () => void;
}) {
  const status = statusInfo(order);
  const items = order?.items ?? [];
  const total = order?.final_amount ?? fallbackTotal;

  return (
    <div className="animate-fade-in-up flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--color-bg)] p-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 text-4xl">
        {status.emoji}
      </div>
      <h1 className={`text-[19px] font-bold ${status.tone}`}>{status.text}</h1>

      <div className="w-full max-w-xs space-y-2 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]">
        {orderType === 'dine_in' ? (
          tableName && (
            <div className="flex items-center justify-between text-[14px]">
              <span className="text-[var(--color-text-secondary)]">Stol</span>
              <span className="font-semibold text-[var(--color-text)]">{tableName}</span>
            </div>
          )
        ) : (
          <div className="flex items-center justify-between text-[14px]">
            <span className="text-[var(--color-text-secondary)]">Turi</span>
            <span className="font-semibold text-[var(--color-text)]">
              {ORDER_TYPE_LABEL[orderType]}
            </span>
          </div>
        )}

        {items.length > 0 && (
          <div className="space-y-1 border-t border-[var(--color-border)] pt-2 text-left">
            {items.map((item, index) => (
              <div key={index} className="flex items-center justify-between text-[13px]">
                <span className="text-[var(--color-text-secondary)]">
                  {item.product_name} × {item.quantity}
                </span>
                <span className="text-[var(--color-text)]">
                  {formatMoney(item.unit_price * item.quantity)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-2 text-[14px]">
          <span className="text-[var(--color-text-secondary)]">Jami</span>
          <span className="font-bold text-[var(--color-text)]">{formatMoney(total)} so'm</span>
        </div>
      </div>

      <p className="max-w-xs text-[13px] text-[var(--color-text-secondary)]">
        {orderType !== 'dine_in'
          ? 'Buyurtmangiz qabul qilindi — tez orada siz bilan bog\'lanamiz.'
          : order?.kitchen_status === 'ready'
            ? 'Yoqimli ishtaha! To\'lov uchun kassirga murojaat qiling.'
            : 'Holat avtomatik yangilanib turadi.'}
      </p>
      <button
        onClick={onOrderMore}
        className="mt-2 rounded-full bg-[var(--color-accent)] px-6 py-3 text-[15px] font-semibold text-[var(--color-accent-text)] shadow-[var(--shadow-md)] transition active:scale-95"
      >
        Yana buyurtma qo'shish
      </button>
    </div>
  );
}
