import { formatMoney } from '../utils/format';

// Savatda mahsulot bo'lganda ekranning pastida suzib turuvchi panel.
export default function CartBar({
  count,
  total,
  onOpen,
}: {
  count: number;
  total: number;
  onOpen: () => void;
}) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 px-4"
      style={{ paddingBottom: 'calc(var(--safe-bottom) + 12px)' }}
    >
      <button
        onClick={onOpen}
        className="animate-bar-pop-in flex w-full max-w-[560px] mx-auto items-center justify-between gap-3 rounded-full bg-[var(--color-accent)] px-5 py-3.5 shadow-[var(--shadow-lg)] transition active:scale-[0.98]"
      >
        <span className="flex items-center gap-2 text-[14.5px] font-semibold text-[var(--color-accent-text)]">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25 text-[12px]">
            {count}
          </span>
          {formatMoney(total)} so'm
        </span>
        <span className="text-[14.5px] font-semibold text-[var(--color-accent-text)]">
          Savatni ko'rish →
        </span>
      </button>
    </div>
  );
}
