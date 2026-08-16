import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTelegramOrder, getMenuByTableToken } from './api';
import { getTelegramWebApp, isRunningInTelegram } from './telegram';
import type { ActiveOrder, MenuResponse, Product } from './types';
import { useCart } from './hooks/useCart';
import Header from './components/Header';
import SearchBar from './components/SearchBar';
import CategoryList from './components/CategoryList';
import ProductCard from './components/ProductCard';
import ProductModal from './components/ProductModal';
import CartBar from './components/CartBar';
import CartScreen from './components/CartScreen';
import ConfirmedScreen from './components/ConfirmedScreen';
import CurrentBillPanel from './components/CurrentBillPanel';
import EmptyState from './components/EmptyState';
import ProfileScreen from './components/ProfileScreen';
import { SkeletonGrid } from './components/SkeletonCard';

const tg = getTelegramWebApp();

type Stage = 'loading' | 'error' | 'menu' | 'confirmed';
// Menyu ikki bosqichli: 'categories' — kategoriyalar ro'yxati,
// 'products' — tanlangan kategoriya taomlari, 'cart' — savat,
// 'profile' — mijozning profili va buyurtmalar tarixi.
type View = 'categories' | 'products' | 'cart' | 'profile';
type CheckoutMessage = { type: 'error' | 'info'; text: string };

/**
 * TELEGRAM WEBAPP — FAQAT STOL REJIMI.
 *
 * Ilova `?table=<token>` bilan ochiladi; tokenni bot `/start table_<token>`
 * orqali uzatadi. Mijoz stolda o'tiribdi: unga faqat menyu va stolning
 * joriy hisobi kerak.
 *
 * Uydan (yetkazib berish/olib ketish) buyurtma bu yerdan **olib tashlandi**.
 * Sabab: u Telegram initData imzosini talab qilardi, ya'ni kafe bot
 * ochmaguncha online savdo qila olmasdi. Endi u ochiq veb sahifa orqali
 * ishlaydi — qarang: pages/WebMenu.tsx (`/menyu/<business_code>`).
 */
export default function App() {
  const navigate = useNavigate();
  const tableToken = useMemo(
    () => new URLSearchParams(window.location.search).get('table') ?? '',
    [],
  );

  const [stage, setStage] = useState<Stage>('loading');
  const [view, setView] = useState<View>('categories');
  const [errorMessage, setErrorMessage] = useState('');
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [openCategoryId, setOpenCategoryId] = useState('');
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<CheckoutMessage | null>(null);
  const [lastOrderTotal, setLastOrderTotal] = useState(0);
  const [tableName, setTableName] = useState('');
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);

  // Telegram WebApp'ning ready()/expand()/mavzu sozlamalari endi marshrut
  // darajasida (routes.tsx, useTelegramChrome) — barcha sahifalar uchun
  // umumiy, shu yerda takrorlanmaydi.

  // Menyuni yuklash. Stol endpointi menyu bilan birga stol nomini va joriy
  // hisobni ham qaytaradi.
  useEffect(() => {
    if (!tableToken) {
      setErrorMessage('Stol aniqlanmadi. Stolingizdagi QR kodni skanerlang.');
      setStage('error');
      return;
    }

    getMenuByTableToken(tableToken)
      .then((data) => {
        setMenu(data);
        setTableName(data.table_name ?? '');
        setActiveOrder(data.active_order ?? null);
        setStage('menu');
      })
      .catch(() => {
        setErrorMessage("Menyuni yuklab bo'lmadi. Birozdan so'ng qayta urinib ko'ring.");
        setStage('error');
      });
  }, [tableToken]);

  // Hisob doimiy kuzatiladi — kassir taom qo'shsa yoki "tayyor" deb belgilasa,
  // mijoz menyudan chiqmasdan ko'radi.
  useEffect(() => {
    if (!tableToken) return;
    const refresh = () => {
      getMenuByTableToken(tableToken)
        .then((data) => {
          setActiveOrder(data.active_order ?? null);
          if (data.table_name) setTableName(data.table_name);
        })
        .catch(() => {});
    };
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [tableToken]);

  const productsById = useMemo(() => {
    const map: Record<string, Product> = {};
    for (const cat of menu?.categories ?? []) {
      for (const p of cat.products) map[p.id] = p;
    }
    return map;
  }, [menu]);

  const cart = useCart(productsById);

  // Savatda mahsulot bor paytda Mini App'ni tasodifan yopib qo'yishdan himoya
  useEffect(() => {
    if (!tg) return;
    if (cart.count > 0) tg.enableClosingConfirmation?.();
    else tg.disableClosingConfirmation?.();
  }, [cart.count]);

  // Telegram BackButton — ichki ekranlarda "orqaga" ishorasi sifatida
  useEffect(() => {
    const btn = tg?.BackButton;
    if (!btn) return;
    const canGoBack = view !== 'categories' || stage === 'confirmed';
    if (canGoBack) btn.show();
    else btn.hide();

    const onClick = () => {
      if (stage === 'confirmed') {
        setStage('menu');
        setView('categories');
        return;
      }
      if (view === 'cart') {
        setView(openCategoryId ? 'products' : 'categories');
        return;
      }
      setView('categories');
      setOpenCategoryId('');
    };
    btn.onClick(onClick);
    return () => btn.offClick(onClick);
  }, [view, stage, openCategoryId]);

  async function handleCheckout() {
    if (cart.count === 0) return;
    setSubmitting(true);
    setCheckoutMessage(null);
    try {
      const items = cart.lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity }));
      await createTelegramOrder(tableToken, tg?.initData ?? '', items);

      setLastOrderTotal(cart.total);
      // Stol nomi va joriy hisobni ko'rsatish uchun best-effort so'rov —
      // muvaffaqiyatsiz bo'lsa ham buyurtma allaqachon qabul qilingan.
      getMenuByTableToken(tableToken)
        .then((data) => {
          setTableName(data.table_name ?? '');
          setActiveOrder(data.active_order ?? null);
        })
        .catch(() => {});

      cart.clear();
      tg?.HapticFeedback?.notificationOccurred('success');
      tg?.disableClosingConfirmation?.();
      setStage('confirmed');
      setView('categories');
    } catch (err: any) {
      tg?.HapticFeedback?.notificationOccurred('error');
      setCheckoutMessage({
        type: 'error',
        text: err?.response?.data?.error ?? 'Buyurtma yuborishda xatolik yuz berdi',
      });
    } finally {
      setSubmitting(false);
    }
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
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
        <EmptyState emoji="😕" title={errorMessage} isError />
      </div>
    );
  }

  // Profil butun ekranni egallaydi (menyu ustidan), shuning uchun stage
  // tekshiruvlaridan keyin, savat/menyu chizilishidan oldin qaytariladi.
  if (view === 'profile' && menu?.business_code) {
    return (
      <ProfileScreen
        businessCode={menu.business_code}
        onBack={() => setView('categories')}
        // Kuzatuv sahifasi alohida marshrutda — stol rejimidan chiqib
        // ketamiz, chunki u uydan berilgan buyurtmaga tegishli.
        //
        // navigate(), window.location emas: Telegram ichida to'liq sahifa
        // qayta yuklanishi butun bootstrap'ni (ready(), tema) qaytadan
        // ishga tushirardi. WebMenu.tsx da ham xuddi shunday.
        onOpenOrder={(publicToken) => navigate(`/buyurtma/${publicToken}`)}
      />
    );
  }

  if (stage === 'confirmed') {
    return (
      <ConfirmedScreen
        order={activeOrder}
        fallbackTotal={lastOrderTotal}
        tableName={tableName}
        orderType="dine_in"
        onOrderMore={() => {
          setStage('menu');
          setView('categories');
        }}
      />
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-[560px] bg-[var(--color-bg)]">
      {view === 'cart' ? (
        <CartScreen
          lines={cart.lines}
          total={cart.total}
          submitting={submitting}
          checkoutMessage={checkoutMessage}
          tableName={tableName}
          onBack={() => setView(openCategoryId ? 'products' : 'categories')}
          onIncrement={cart.increment}
          onDecrement={cart.decrement}
          onSubmit={handleCheckout}
        />
      ) : (
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
            <Header
              businessName={menu?.business_name ?? ''}
              onOpenProfile={
                isRunningInTelegram(tg) && menu?.business_code
                  ? () => setView('profile')
                  : undefined
              }
            />
          )}

          {/* Stolda o'tirgan mijozga menyudan tashqari faqat joriy hisob kerak. */}
          <CurrentBillPanel order={activeOrder} tableName={tableName || 'Stol'} />

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
                <EmptyState emoji="🔎" title="Hech narsa topilmadi" subtitle="Boshqa nom bilan qidiring" />
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
      )}

      {view !== 'cart' && cart.count > 0 && (
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
