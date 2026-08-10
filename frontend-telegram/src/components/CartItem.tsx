import type { CartLine } from '../types';
import { formatMoney } from '../utils/format';
import QuantityControl from './QuantityControl';

export default function CartItem({
  line,
  onIncrement,
  onDecrement,
}: {
  line: CartLine;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
}) {
  const { product, quantity } = line;
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-border)]">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg">🍽️</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-semibold text-[var(--color-text)]">
          {product.name}
        </p>
        <p className="text-[13px] text-[var(--color-text-secondary)]">
          {formatMoney(product.price)} so'm
        </p>
      </div>
      <QuantityControl
        quantity={quantity}
        onIncrement={() => onIncrement(product.id)}
        onDecrement={() => onDecrement(product.id)}
        size="sm"
      />
    </div>
  );
}
