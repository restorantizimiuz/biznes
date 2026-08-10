import { memo, useState } from 'react';
import type { Product } from '../types';
import { formatMoney } from '../utils/format';
import { resolveImageUrl } from '../api';
import QuantityControl from './QuantityControl';

// Rasm yo'q mahsulotlar uchun nomga qarab barqaror (har safar bir xil) gradient
// tanlanadi — shunda rasmsiz kartochka ham chiroyli va tartibli ko'rinadi.
const PLACEHOLDER_GRADIENTS = [
  'from-orange-200 to-rose-200',
  'from-amber-200 to-orange-300',
  'from-rose-200 to-pink-200',
  'from-yellow-200 to-amber-300',
  'from-orange-200 to-amber-200',
];

function placeholderGradient(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PLACEHOLDER_GRADIENTS[hash % PLACEHOLDER_GRADIENTS.length];
}

function ProductCard({
  product,
  quantity,
  onIncrement,
  onDecrement,
  onOpen,
}: {
  product: Product;
  quantity: number;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onOpen: (product: Product) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const imageSrc = resolveImageUrl(product.image_url);
  const showImage = Boolean(imageSrc) && !imgFailed;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(product)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen(product);
      }}
      className="flex cursor-pointer flex-col overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-surface)] text-left shadow-[var(--shadow-sm)] transition active:scale-[0.98]"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-[var(--color-border)]">
        {showImage ? (
          <img
            src={imageSrc}
            alt={product.name}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center bg-gradient-to-br text-3xl ${placeholderGradient(product.name)}`}
          >
            🍽️
          </div>
        )}
        <div className="absolute bottom-2 right-2">
          <QuantityControl
            quantity={quantity}
            onIncrement={() => onIncrement(product.id)}
            onDecrement={() => onDecrement(product.id)}
            size="sm"
          />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-2.5">
        <p className="line-clamp-1 text-[14.5px] font-semibold text-[var(--color-text)]">
          {product.name}
        </p>
        {product.description && (
          <p className="line-clamp-2 text-[12px] leading-snug text-[var(--color-text-secondary)]">
            {product.description}
          </p>
        )}
        <p className="mt-1.5 text-[14px] font-bold text-[var(--color-accent)]">
          {formatMoney(product.price)} so'm
        </p>
      </div>
    </div>
  );
}

export default memo(ProductCard);
