import { useState } from 'react';
import type { ActiveOrder } from '../types';
import { formatMoney } from '../utils/format';

// Kassir buyurtmani ko'rgach holatni belgilaydi — mijoz shu yerda kuzatadi.
function statusLabel(order: ActiveOrder) {
  if (order.status === 'new') return { emoji: '⏳', text: "Kassir tasdig'i kutilmoqda" };
  if (order.kitchen_status === 'ready') return { emoji: '🍽️', text: 'Buyurtmangiz tayyor' };
  return { emoji: '👨‍🍳', text: 'Tayyorlanmoqda' };
}

/**
 * Stol rejimidagi "Joriy hisob" paneli.
 *
 * Stolda o'tirgan mijozga faqat ikki narsa kerak: nima buyurtma qilish mumkin
 * va hozir qancha bo'ldi. Shuning uchun hisob menyu ustida doim ko'rinib
 * turadi va 5 soniyada yangilanadi — kassir qo'shgan taomlar ham shu yerda
 * paydo bo'ladi (bitta stol = bitta umumiy hisob).
 *
 * Ro'yxat yig'ilgan holatda ochiladi: taomlar ko'p bo'lsa panel butun ekranni
 * egallab, menyuni bosib qo'ymasligi kerak.
 */
export default function CurrentBillPanel({
  order,
  tableName,
}: {
  order: ActiveOrder | null;
  tableName: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!order) {
    return (
      <div className="mx-4 mb-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] px-4 py-3 shadow-[var(--shadow-sm)]">
        <p className="text-[13px] font-semibold text-[var(--color-text)]">{tableName}</p>
        <p className="text-[12px] text-[var(--color-text-secondary)]">
          Hozircha buyurtma yo'q — menyudan tanlang
        </p>
      </div>
    );
  }

  const status = statusLabel(order);

  return (
    <div className="mx-4 mb-3 overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-surface)] shadow-[var(--shadow-sm)]">
      <button
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="text-xl">{status.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[var(--color-text)]">
            {tableName} · Joriy hisob
          </p>
          <p className="truncate text-[12px] text-[var(--color-text-secondary)]">{status.text}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[15px] font-bold text-[var(--color-text)]">
            {formatMoney(order.final_amount)}
          </p>
          <p className="text-[11px] text-[var(--color-text-secondary)]">
            {expanded ? 'yopish ▲' : "batafsil ▼"}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="space-y-1 border-t border-[var(--color-border)] px-4 py-2.5">
          {order.items.map((item, index) => (
            <div key={index} className="flex items-center justify-between text-[13px]">
              <span className="text-[var(--color-text-secondary)]">
                {item.product_name} × {item.quantity}
              </span>
              <span className="text-[var(--color-text)]">
                {formatMoney(item.unit_price * item.quantity)}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-2 text-[13px] font-semibold">
            <span className="text-[var(--color-text)]">Jami</span>
            <span className="text-[var(--color-text)]">
              {formatMoney(order.final_amount)} so'm
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
