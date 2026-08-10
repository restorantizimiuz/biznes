import { memo, useState } from 'react';
import { resolveImageUrl } from '../api/client';
import type { Product } from '../api/types';

// Rasm yo'q taomlar uchun nomga qarab barqaror (har safar bir xil) gradient
// tanlanadi. Mantiq Telegram ilovasidagi ProductCard bilan bir xil — kassa va
// mijoz menyusida bitta taom bir xil rangda ko'rinishi uchun.
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

// Kassadagi taom kartochkasi.
//
// Butun kartochka bosiladi va miqdor +1 bo'ladi — xuddi stol tanlagandek,
// bitta harakatda. Kichik "+" tugmasini nishonga olish kassirni sekinlashtiradi.
// Kamaytirish uchun kichik "−" tugmasi qoladi: usiz xato tanlovni tuzatib
// bo'lmasdi.
function ProductPickCard({
  product,
  quantity,
  currency,
  onAdd,
  onRemove,
}: {
  product: Product;
  quantity: number;
  currency: string;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const imageSrc = resolveImageUrl(product.image_url);
  const showImage = Boolean(imageSrc) && !imgFailed;

  return (
    <button
      type="button"
      onClick={() => onAdd(product.id)}
      className={`relative flex flex-col overflow-hidden rounded-xl border text-left transition active:scale-[0.98] ${
        quantity > 0
          ? 'border-indigo-400 bg-indigo-50/60 ring-2 ring-indigo-200'
          : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm'
      }`}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-slate-100">
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

        {quantity > 0 && (
          <>
            <span className="absolute right-1.5 top-1.5 flex h-7 min-w-7 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-sm font-bold text-white shadow">
              {quantity}
            </span>
            {/* Kamaytirish tugmasi kartochka ichida, lekin bosilganda
                kartochkaning "qo'shish" amali ishlamasligi kerak. */}
            <span
              role="button"
              tabIndex={-1}
              aria-label="−"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(product.id);
              }}
              className="absolute bottom-1.5 left-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-lg font-semibold text-slate-700 shadow hover:bg-white"
            >
              −
            </span>
          </>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-0.5 p-2">
        <p className="line-clamp-2 text-[13px] font-medium leading-tight text-slate-900">
          {product.name}
        </p>
        <p className="mt-auto pt-1 text-[13px] font-semibold text-indigo-600">
          {product.price.toLocaleString()} {currency}
        </p>
      </div>
    </button>
  );
}

export default memo(ProductPickCard);
