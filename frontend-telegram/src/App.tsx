import { useEffect, useMemo, useRef, useState } from 'react';
import { createTelegramOrder, getMenuByTableToken } from './api';
import { getTelegramWebApp } from './telegram';
import type { MenuResponse, Product } from './types';
import { useCart } from './hooks/useCart';
import Header from './components/Header';
import SearchBar from './components/SearchBar';
import CategoryTabs, { type CategoryTab } from './components/CategoryTabs';
import ProductCard from './components/ProductCard';
import ProductModal from './components/ProductModal';
import CartBar from './components/CartBar';
import CartScreen from './components/CartScreen';
import ConfirmedScreen from './components/ConfirmedScreen';
import EmptyState from './components/EmptyState';
import { SkeletonGrid } from './components/SkeletonCard';

const tg = getTelegramWebApp();

// Stol QR kodi to'liq Telegram deep-link (".../start=table_<token>") sifatida
// kodlangan, shuning uchun skaner natijasidan tokenni ajratib olamiz. Agar kimdir
// faqat tokenning o'zini skanerlagan bo'lsa (masalan sinov uchun), buni ham qabul qilamiz.
function parseTableToken(scannedText: string): string | null {
  const match = scannedText.match(/table_([0-9a-fA-F-]{8,})/);
  if (match) return match[1];
  const trimmed = scannedText.trim();
  if (/^[0-9a-fA-F-]{8,}$/.test(trimmed)) return trimmed;
  return null;
}

type Stage = 'loading' | 'error' | 'menu' | 'confirmed';
type View = 'browse' | 'cart';

export default function App() {
  const tableToken = useMemo(
    () => new URLSearchParams(window.location.search).get('table') ?? '',
    [],
  );

  const [stage, setStage] = useState<Stage>('loading');
  const [view, setView] = useState<View>('browse');
  const [errorMessage, setErrorMessage] = useState('');
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastOrderTotal, setLastOrderTotal] = useState(0);

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const pillRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Telegram WebApp'ni ishga tushirish + mavzu (light/dark) o'zgarishini kuzatish.
  // Ranglarning o'zi CSS o'zgaruvchilari orqali avtomatik yangilanadi (index.css) —
  // bu yerda faqat `data-tg-scheme` atributi qo'yiladi, chunki Telegram'ning
  // tanlagan mavzusi qurilma OS sozlamasidan farq qilishi mumkin.
  useEffect(() => {
    if (!tg) return;
    tg.ready();
    tg.expand();
    const applyScheme = () => {
      document.documentElement.dataset.tgScheme = tg.colorScheme;
    };
    applyScheme();
    tg.setHeaderColor?.('secondary_bg_color');
    tg.setBackgroundColor?.('bg_color');
    tg.onEvent('themeChanged', applyScheme);
    return () => tg.offEvent('themeChanged', applyScheme);
  }, []);

  useEffect(() => {
    if (!tableToken) {
      setErrorMessage(
        'Stol topilmadi. Iltimos, stolingizdagi QR kodni qayta skanerlab, botni shu orqali oching.',
      );
      setStage('error');
      return;
    }
    getMenuByTableToken(tableToken)
      .then((data) => {
        setMenu(data);
        setActiveCategory(data.categories[0]?.id ?? '');
        setStage('menu');
      })
      .catch(() => {
        setErrorMessage("Menyuni yuklab bo'lmadi. Birozdan so'ng qayta urinib ko'ring.");
        setStage('error');
      });
  }, [tableToken]);

  const productsById = useMemo(() => {
    const map: Record<string, Product> = {};
    for (const cat of menu?.categories ?? []) {
      for (const p of cat.products) map[p.id] = p;
    }
    return map;
  }, [menu]);

  const cart = useCart(productsById);

  // Foydalanuvchi menyuni pastga aylantirganda, hozir ko'rinib turgan
  // kategoriyaga mos pastki yorliq avtomatik yoritiladi (scroll-spy).
  useEffect(() => {
    if (stage !== 'menu' || view !== 'browse' || !menu || searchQuery.trim()) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-category-id');
            if (id) setActiveCategory(id);
          }
        }
      },
      { rootMargin: '-110px 0px -70% 0px', threshold: 0 },
    );
    for (const cat of menu.categories) {
      const el = sectionRefs.current[cat.id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [stage, view, menu, searchQuery]);

  useEffect(() => {
    pillRefs.current[activeCategory]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [activeCategory]);

  // Telegram BackButton — savat ekranida "orqaga" ishorasi sifatida
  useEffect(() => {
    const btn = tg?.BackButton;
    if (!btn) return;
    if (view === 'cart') btn.show();
    else btn.hide();
    const onClick = () => setView('browse');
    btn.onClick(onClick);
    return () => btn.offClick(onClick);
  }, [view]);

  function scrollToCategory(id: string) {
    setActiveCategory(id);
    if (id === 'all') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function submitOrder(confirmedTableToken: string) {
    if (cart.count === 0) return;
    setSubmitting(true);
    setErrorMessage('');
    try {
      const initData = tg?.initData ?? '';
      const items = cart.lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity }));
      await createTelegramOrder(confirmedTableToken, initData, items);
      setLastOrderTotal(cart.total);
      cart.clear();
      tg?.HapticFeedback?.notificationOccurred('success');
      setStage('confirmed');
      setView('browse');
    } catch (err: any) {
      tg?.HapticFeedback?.notificationOccurred('error');
      setErrorMessage(err?.response?.data?.error ?? 'Buyurtma yuborishda xatolik yuz berdi');
    } finally {
      setSubmitting(false);
    }
  }

  // "Buyurtma berish" bosilganda avval stol QR kodini skanerlashni so'raymiz —
  // shu orqali mijoz haqiqatan ham stol yonida ekanligi tasdiqlanadi. Telegram
  // tashqarisida (oddiy brauzerda sinashda) skaner mavjud emas, shu holatda
  // to'g'ridan-to'g'ri havoladagi stol tokeni bilan yuboriladi.
  function handleOrderButtonClick() {
    if (cart.count === 0) return;
    if (!tg?.initData || !tg.showScanQrPopup) {
      submitOrder(tableToken);
      return;
    }
    setErrorMessage('');
    tg.showScanQrPopup(
      { text: 'Buyurtmani tasdiqlash uchun stolingizdagi QR kodni skanerlang' },
      (scannedText) => {
        const scannedToken = parseTableToken(scannedText);
        if (!scannedToken) {
          setErrorMessage('Bu stol QR kodi emas. Iltimos, aynan stolingizdagi QR kodni skanerlang.');
          return false;
        }
        tg.closeScanQrPopup?.();
        submitOrder(scannedToken);
        return true;
      },
    );
  }

  function handleCommitProduct(quantity: number) {
    if (activeProduct) cart.setQuantity(activeProduct.id, quantity);
    setActiveProduct(null);
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!normalizedQuery) return [];
    return Object.values(productsById).filter(
      (p) =>
        p.name.toLowerCase().includes(normalizedQuery) ||
        p.description.toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery, productsById]);

  const categoryTabs: CategoryTab[] = useMemo(() => {
    if (!menu) return [];
    return [{ id: 'all', name: 'Barchasi' }, ...menu.categories.map((c) => ({ id: c.id, name: c.name }))];
  }, [menu]);

  if (stage === 'loading') {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] pb-10">
        <div className="px-4 pt-6">
          <div className="skeleton-shimmer mb-2 h-5 w-40 rounded-full" />
          <div className="skeleton-shimmer mb-5 h-3 w-24 rounded-full" />
          <SkeletonGrid />
        </div>
      </div>
    );
  }

  if (stage === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)]">
        <EmptyState emoji="😕" title={errorMessage} isError />
      </div>
    );
  }

  if (stage === 'confirmed') {
    return <ConfirmedScreen total={lastOrderTotal} onOrderMore={() => setStage('menu')} />;
  }

  return (
    <div className="mx-auto min-h-screen max-w-[560px] bg-[var(--color-bg)]">
      {view === 'cart' ? (
        <CartScreen
          tableName={menu?.table_name ?? ''}
          lines={cart.lines}
          total={cart.total}
          submitting={submitting}
          errorMessage={errorMessage}
          onBack={() => setView('browse')}
          onIncrement={cart.increment}
          onDecrement={cart.decrement}
          onSubmit={handleOrderButtonClick}
        />
      ) : (
        <div className="pb-28">
          <Header businessName={menu?.business_name ?? ''} tableName={menu?.table_name ?? ''} />

          <div className="px-4 pb-1">
            <SearchBar value={searchQuery} onChange={setSearchQuery} />
          </div>

          {!normalizedQuery && categoryTabs.length > 1 && (
            <div className="sticky top-0 z-10 bg-[var(--color-bg)]/95 backdrop-blur">
              <CategoryTabs
                tabs={categoryTabs}
                activeId={activeCategory || 'all'}
                onSelect={scrollToCategory}
                pillRefs={pillRefs}
              />
            </div>
          )}

          <div className="px-4 pt-3">
            {normalizedQuery ? (
              searchResults.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {searchResults.map((p) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      quantity={cart.quantities[p.id] ?? 0}
                      onIncrement={cart.increment}
                      onDecrement={cart.decrement}
                      onOpen={setActiveProduct}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState emoji="🔎" title="Hech narsa topilmadi" subtitle="Boshqa nom bilan qidiring" />
              )
            ) : (
              <div className="space-y-6">
                {menu?.categories.map((cat) => (
                  <section
                    key={cat.id}
                    data-category-id={cat.id}
                    ref={(el) => {
                      sectionRefs.current[cat.id] = el;
                    }}
                    className="scroll-mt-28"
                  >
                    <h2 className="mb-2.5 text-[15px] font-bold text-[var(--color-text)]">{cat.name}</h2>
                    <div className="grid grid-cols-2 gap-3">
                      {cat.products.map((p) => (
                        <ProductCard
                          key={p.id}
                          product={p}
                          quantity={cart.quantities[p.id] ?? 0}
                          onIncrement={cart.increment}
                          onDecrement={cart.decrement}
                          onOpen={setActiveProduct}
                        />
                      ))}
                    </div>
                  </section>
                ))}
                {menu?.categories.length === 0 && (
                  <EmptyState emoji="🍽️" title="Hozircha menyu bo'sh" />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {view === 'browse' && cart.count > 0 && (
        <CartBar count={cart.count} total={cart.total} onOpen={() => setView('cart')} />
      )}

      {activeProduct && (
        <ProductModal
          product={activeProduct}
          cartQuantity={cart.quantities[activeProduct.id] ?? 0}
          onClose={() => setActiveProduct(null)}
          onCommit={handleCommitProduct}
        />
      )}
    </div>
  );
}
