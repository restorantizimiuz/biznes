import type { MenuCategory } from '../types';
import { resolveImageUrl } from '../api';

// Menyu endi ikki bosqichli: avval kategoriya tanlanadi, keyin uning taomlari
// ko'rsatiladi. Bu uzun bitta ro'yxatga qaraganda telefonda ancha qulay.
export default function CategoryList({
  categories,
  onSelect,
}: {
  categories: MenuCategory[];
  onSelect: (categoryId: string) => void;
}) {
  return (
    <div className="space-y-2.5 px-4 pt-2">
      {categories.map((category) => {
        // Kategoriya uchun ko'rgazmali rasm — ichidagi birinchi rasmli taomdan olinadi
        const cover = resolveImageUrl(category.products.find((p) => p.image_url)?.image_url ?? '');
        return (
          <button
            key={category.id}
            onClick={() => onSelect(category.id)}
            className="flex w-full items-center gap-3 overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-surface)] p-3 text-left shadow-[var(--shadow-sm)] transition active:scale-[0.98]"
          >
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-border)]">
              {cover ? (
                <img
                  src={cover}
                  alt={category.name}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-200 to-rose-200 text-2xl">
                  🍽️
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-semibold text-[var(--color-text)]">
                {category.name}
              </p>
              <p className="text-[12.5px] text-[var(--color-text-secondary)]">
                {category.products.length} ta taom
              </p>
            </div>
            <span className="shrink-0 text-[var(--color-text-secondary)]">›</span>
          </button>
        );
      })}
    </div>
  );
}
