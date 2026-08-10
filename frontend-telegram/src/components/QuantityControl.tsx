import { useEffect, useRef, useState } from 'react';

// Bitta qayta ishlatiladigan +/- stepper — mahsulot kartochkasida (kichik,
// rasm ustida floating), mahsulot sahifasida va savatda (katta) ishlatiladi.
export default function QuantityControl({
  quantity,
  onIncrement,
  onDecrement,
  size = 'md',
}: {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  size?: 'sm' | 'md';
}) {
  const [pulse, setPulse] = useState(false);
  const prevQuantity = useRef(quantity);

  useEffect(() => {
    if (quantity !== prevQuantity.current) {
      setPulse(true);
      prevQuantity.current = quantity;
      const t = setTimeout(() => setPulse(false), 240);
      return () => clearTimeout(t);
    }
  }, [quantity]);

  const addBtnSize = size === 'sm' ? 'h-8 w-8 text-base' : 'h-11 w-11 text-lg';
  const stepBtnSize = size === 'sm' ? 'h-7 w-7 text-sm' : 'h-9 w-9 text-base';
  const numberWidth = size === 'sm' ? 'w-4 text-xs' : 'w-6 text-sm';

  if (quantity <= 0) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onIncrement();
        }}
        aria-label="Savatga qo'shish"
        className={`flex ${addBtnSize} shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] font-semibold text-[var(--color-accent-text)] shadow-[var(--shadow-md)] transition active:scale-90`}
      >
        +
      </button>
    );
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-surface)] shadow-[var(--shadow-md)] ${size === 'sm' ? 'p-0.5' : 'p-1'}`}
    >
      <button
        onClick={onDecrement}
        aria-label="Kamaytirish"
        className={`flex ${stepBtnSize} items-center justify-center rounded-full font-medium text-[var(--color-accent)] transition active:scale-90 active:bg-[var(--color-bg)]`}
      >
        −
      </button>
      <span
        className={`${numberWidth} text-center font-semibold text-[var(--color-text)] ${pulse ? 'animate-qty-pulse' : ''}`}
      >
        {quantity}
      </span>
      <button
        onClick={onIncrement}
        aria-label="Ko'paytirish"
        className={`flex ${stepBtnSize} items-center justify-center rounded-full font-medium text-[var(--color-accent)] transition active:scale-90 active:bg-[var(--color-bg)]`}
      >
        +
      </button>
    </div>
  );
}
