import { formatMoney } from '../utils/format';

export default function ConfirmedScreen({ total, onOrderMore }: { total: number; onOrderMore: () => void }) {
  return (
    <div className="animate-fade-in-up flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--color-bg)] p-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 text-4xl">
        ✅
      </div>
      <h1 className="text-[19px] font-bold text-[var(--color-text)]">Buyurtmangiz qabul qilindi!</h1>
      <p className="max-w-xs text-[14px] text-[var(--color-text-secondary)]">
        Jami: <span className="font-semibold text-[var(--color-text)]">{formatMoney(total)} so'm</span>.
        Ofitsiant/kassa buyurtmangizni tez orada tayyorlashni boshlaydi.
      </p>
      <button
        onClick={onOrderMore}
        className="mt-4 rounded-full bg-[var(--color-accent)] px-6 py-3 text-[15px] font-semibold text-[var(--color-accent-text)] shadow-[var(--shadow-md)] transition active:scale-95"
      >
        Yana buyurtma qo'shish
      </button>
    </div>
  );
}
