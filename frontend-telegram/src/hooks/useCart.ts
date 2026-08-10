import { useCallback, useMemo, useState } from 'react';
import type { CartLine, Product } from '../types';

// Savat holati mahsulot ID -> miqdor ko'rinishida saqlanadi (soddaligi va
// mavjud API kontraktiga (product_id, quantity) to'g'ridan-to'g'ri mos kelishi uchun).
// increment/decrement/setQuantity useCallback bilan barqarorlashtirilgan —
// shunda ProductCard'lar React.memo orqali keraksiz qayta render'lanmaydi.
export function useCart(productsById: Record<string, Product>) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setQuantities((current) => {
      const next = { ...current };
      if (quantity <= 0) {
        delete next[productId];
      } else {
        next[productId] = quantity;
      }
      return next;
    });
  }, []);

  const increment = useCallback(
    (productId: string) => {
      setQuantities((current) => ({ ...current, [productId]: (current[productId] ?? 0) + 1 }));
    },
    [],
  );

  const decrement = useCallback((productId: string) => {
    setQuantities((current) => {
      const next = { ...current };
      const value = (next[productId] ?? 0) - 1;
      if (value <= 0) {
        delete next[productId];
      } else {
        next[productId] = value;
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setQuantities({}), []);

  const lines: CartLine[] = useMemo(() => {
    return Object.entries(quantities)
      .map(([productId, quantity]) => ({ product: productsById[productId], quantity }))
      .filter((line): line is CartLine => Boolean(line.product) && line.quantity > 0);
  }, [quantities, productsById]);

  const count = useMemo(() => lines.reduce((sum, l) => sum + l.quantity, 0), [lines]);
  const total = useMemo(
    () => lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0),
    [lines],
  );

  return { quantities, setQuantity, increment, decrement, clear, lines, count, total };
}
