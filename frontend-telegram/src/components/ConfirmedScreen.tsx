import { formatMoney } from '../utils/format';

export default function ConfirmedScreen({
  orderId,
  total,
  tableName,
  onOrderMore,
}: {
  orderId: string;
  total: number;
  tableName: string;
  onOrderMore: () => void;
}) {
  return (
    <div className="animate-fade-in-up flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--color-bg)] p-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 text-4xl">
        ✅
      </div>
      <h1 className="text-[19px] font-bold text-[var(--color-text)]">Buyurtmangiz qabul qilindi!</h1>

      <div className="w-full max-w-xs space-y-2 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]">
        {tableName && (
          <div className="flex items-center justify-between text-[14px]">
            <span className="text-[var(--color-text-secondary)]">Stol</span>
            <span className="font-semibold text-[var(--color-text)]">{tableName}</span>
          </div>
        )}
        {orderId && (
          <div className="flex items-center justify-between text-[14px]">
            <span className="text-[var(--color-text-secondary)]">Buyurtma raqami</span>
            <span className="font-mono font-semibold text-[var(--color-text)]">
              #{orderId.slice(0, 8)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between text-[14px]">
          <span className="text-[var(--color-text-secondary)]">Jami</span>
          <span className="font-bold text-[var(--color-text)]">{formatMoney(total)} so'm</span>
        </div>
      </div>

      <p className="max-w-xs text-[13px] text-[var(--color-text-secondary)]">
        Ofitsiant/kassa buyurtmangizni tez orada tayyorlashni boshlaydi.
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
