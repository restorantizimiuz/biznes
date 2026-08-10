import { useEffect, useState } from 'react';
import type { Product } from '../types';
import { formatMoney } from '../utils/format';
import QuantityControl from './QuantityControl';

// Mahsulot bosilganda ochiladigan mobile-friendly bottom sheet. Stepper mahalliy
// ("pending") miqdorni boshqaradi, tugma bosilgandagina savatga yoziladi —
// bu ko'plab restoran ilovalarida (Wolt, Yandex Eda) tanish naqsh.
export default function ProductModal({
  product,
  cartQuantity,
  onClose,
  onCommit,
}: {
  product: Product;
  cartQuantity: number;
  onClose: () => void;
  onCommit: (quantity: number) => void;
}) {
  const [pending, setPending] = useState(Math.max(cartQuantity, 1));
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(product.image_url) && !imgFailed;

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/45 animate-overlay-fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet-slide-up flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[var(--radius-lg)] bg-[var(--color-surface)] shadow-[var(--shadow-lg)]"
      >
        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-[var(--color-border)]">
          {showImage ? (
            <img
              src={product.image_url}
              alt={product.name}
              className="h-full w-full object-cover"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-200 to-amber-200 text-5xl">
              🍽️
            </div>
          )}
          <button
            onClick={onClose}
            aria-label="Yopish"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-base text-white backdrop-blur"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-4">
          <h2 className="text-[19px] font-bold text-[var(--color-text)]">{product.name}</h2>
          <p className="mt-1 text-[15px] font-semibold text-[var(--color-accent)]">
            {formatMoney(product.price)} so'm
          </p>
          {product.description && (
            <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-text-secondary)]">
              {product.description}
            </p>
          )}
        </div>

        <div
          className="flex shrink-0 items-center gap-3 border-t border-[var(--color-border)] px-5 pt-3"
          style={{ paddingBottom: 'calc(var(--safe-bottom) + 14px)' }}
        >
          <QuantityControl
            quantity={pending}
            onIncrement={() => setPending((q) => q + 1)}
            onDecrement={() => setPending((q) => Math.max(1, q - 1))}
          />
          <button
            onClick={() => onCommit(pending)}
            className="flex h-12 flex-1 items-center justify-center rounded-full bg-[var(--color-accent)] px-4 text-[15px] font-semibold text-[var(--color-accent-text)] shadow-[var(--shadow-md)] transition active:scale-[0.97]"
          >
            Savatga qo'shish — {formatMoney(product.price * pending)} so'm
          </button>
        </div>
      </div>
    </div>
  );
}
