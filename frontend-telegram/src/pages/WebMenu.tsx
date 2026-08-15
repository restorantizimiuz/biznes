import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getMenuByBusinessCode } from '../api';
import type { MenuResponse, Product } from '../types';
import { useCart } from '../hooks/useCart';
import { getTelegramWebApp, isRunningInTelegram } from '../telegram';
import { parseTableQrUrl } from '../utils/qrParser';
import Header from '../components/Header';
import SearchBar from '../components/SearchBar';
import CategoryList from '../components/CategoryList';
import ProductCard from '../components/ProductCard';
import ProductModal from '../components/ProductModal';
import CartBar from '../components/CartBar';
import EmptyState from '../components/EmptyState';
import { SkeletonGrid } from '../components/SkeletonCard';
import WebCheckout from './WebCheckout';

const tg = getTelegramWebApp();

type Stage = 'loading' | 'error' | 'menu';
type View = 'categories' | 'products' | 'cart';

/**
 * OCHIQ VEB MENYU — kafe shu havolani Instagram profiliga qo'yadi.
 *
 * Telegram'dan farqi: hisob ochish ham, bot ham kerak emas; mijoz uyda
 * o'tirib menyuni ko'radi, savat to'ldiradi va yetkazib berish yoki olib
 * ketishga buyurtma beradi. Stol buyurtmasi bu sahifada umuman yo'q —
 * u Telegram/QR orqali beriladi.
 *
 * Menyu ko'rish komponentlari (ProductCard, CategoryList, SearchBar,
 * ProductModal, CartBar) Telegram ilovasi bilan **umumiy** — takrorlanmaydi.
 */
export default function WebMenu() {
  const { businessCode = '' } = useParams();
  const navigate = useNavigate();

  const [stage, setStage] = useState<Stage>('loading');
  const [view, setView] = useState<View>('categories');
  const [errorMessage, setErrorMessage] = useState('');
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [openCategoryId, setOpenCategoryId] = useState('');
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [scanError, setScanError] = useState('');

  // Stolda o'tirgan mijoz uchun: Telegram'ning o'z QR skaneri orqali stol
  // tokenini olib, mavjud stol-buyurtma ekraniga (App.tsx, "/?table=...")
  // o'tkazadi — yangi savat/buyurtma tizimi yaratilmaydi, faqat marshrut
  // almashadi. Faqat Telegram ichida ishlaydi (oddiy brauzerda tugma
  // ko'rinmaydi), chunki showScanQrPopup faqat Telegram WebView'da mavjud.
  function handleScanTable() {
    if (!tg?.showScanQrPopup) return;
    setScanError('');
    tg.showScanQrPopup({ text: 'Stolingizdagi QR kodni skanerlang' }, (scanned) => {
      const token = parseTableQrUrl(scanned);
      if (token) {
        navigate(`/?table=${encodeURIComponent(token)}`);
        return true; // popupni yopadi
      }
      setScanError("Bu QR kod restoranning stol kodi emas. Qayta urinib ko'ring.");
      return false; // popup ochiq qoladi, mijoz qayta skanerlashi mumkin
    });
  }

  useEffect(() => {
    if (!businessCode) {
      setErrorMessage('Restoran aniqlanmadi.');
      setStage('error');
      return;
    }
    getMenuByBusinessCode(businessCode)
      .then((data) => {
        setMenu(data);
        setStage('menu');
        document.title = `${data.business_name} — menyu`;
      })
      .catch(() => {
        setErrorMessage("Menyuni yuklab bo'lmadi. Birozdan so'ng qayta urinib ko'ring.");
        setStage('error');
      });
  }, [businessCode]);

  const productsById = useMemo(() => {
    const map: Record<string, Product> = {};
    for (const cat of menu?.categories ?? []) {
      for (const p of cat.products) map[p.id] = p;
    }
    return map;
  }, [menu]);

  const cart = useCart(productsById);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!normalizedQuery) return [];
    return Object.values(productsById).filter(
      (p) =>
        p.name.toLowerCase().includes(normalizedQuery) ||
        p.description.toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery, productsById]);

  // `menu.categories` backendda hech qanday mahsulot topilmasa (masalan
  // barcha taomlar "tugadi" deb belgilangan) Go'ning bo'sh slice → JSON
  // `null` xatti-harakati sabab `null` bo'lib kelishi mumkin — shuning
  // uchun optional chaining ikkinchi marta ham qo'llanadi.
  const openCategory = menu?.categories?.find((c) => c.id === openCategoryId) ?? null;

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

  if (view === 'cart') {
    return (
      <WebCheckout
        businessCode={businessCode}
        businessName={menu?.business_name ?? ''}
        orderTypes={menu?.order_types}
        lines={cart.lines}
        total={cart.total}
        onBack={() => setView(openCategoryId ? 'products' : 'categories')}
        onIncrement={cart.increment}
        onDecrement={cart.decrement}
        onOrdered={(publicToken) => {
          cart.clear();
          navigate(`/buyurtma/${publicToken}`);
        }}
      />
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-[560px] bg-[var(--color-bg)]">
      <div className="pb-28">
        {view === 'products' && openCategory ? (
          <header
            className="flex items-center gap-3 px-4 pb-3"
            style={{ paddingTop: 'calc(var(--safe-top) + 12px)' }}
          >
            <button
              onClick={() => {
                setView('categories');
                setOpenCategoryId('');
              }}
              aria-label="Orqaga"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface)] text-base shadow-[var(--shadow-sm)] transition active:scale-90"
            >
              ←
            </button>
            <h1 className="truncate text-[17px] font-bold text-[var(--color-text)]">
              {openCategory.name}
            </h1>
          </header>
        ) : (
          <Header businessName={menu?.business_name ?? ''} />
        )}

        {view !== 'products' && tg && isRunningInTelegram(tg) && tg.showScanQrPopup && (
          <div className="px-4 pb-2">
            <button
              onClick={handleScanTable}
              className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border-2 border-dashed border-[var(--color-accent)] bg-[var(--color-surface)] px-3 py-2.5 text-[13px] font-semibold text-[var(--color-accent)] transition active:scale-[0.98]"
            >
              📷 Stol uchun buyurtma (QR skanerlash)
            </button>
            {scanError && (
              <p className="mt-1.5 text-[12px] text-[var(--color-danger)]">{scanError}</p>
            )}
          </div>
        )}

        <div className="px-4 pb-1">
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
        </div>

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
              <EmptyState
                emoji="🔎"
                title="Hech narsa topilmadi"
                subtitle="Boshqa nom bilan qidiring"
              />
            )
          ) : view === 'products' && openCategory ? (
            <div className="grid grid-cols-2 gap-3">
              {openCategory.products.map((p) => (
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
          ) : menu?.categories && menu.categories.length > 0 ? (
            <CategoryList
              categories={menu.categories}
              onSelect={(id) => {
                setOpenCategoryId(id);
                setView('products');
                window.scrollTo({ top: 0 });
              }}
            />
          ) : (
            <EmptyState emoji="🍽️" title="Hozircha menyu bo'sh" />
          )}
        </div>
      </div>

      {cart.count > 0 && (
        <CartBar count={cart.count} total={cart.total} onOpen={() => setView('cart')} />
      )}

      {activeProduct && (
        <ProductModal
          product={activeProduct}
          cartQuantity={cart.quantities[activeProduct.id] ?? 0}
          onClose={() => setActiveProduct(null)}
          onCommit={(quantity) => {
            cart.setQuantity(activeProduct.id, quantity);
            setActiveProduct(null);
          }}
        />
      )}
    </div>
  );
}
