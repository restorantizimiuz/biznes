import { useEffect, useMemo, useRef, useState } from 'react';
import { createTelegramOrder, getMenuByBusinessCode, getMenuByTableToken } from './api';
import { getTelegramWebApp } from './telegram';
import type { MenuResponse, Product } from './types';
import { useCart } from './hooks/useCart';
import { parseTableQr } from './utils/qrParser';
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
const BOT_USERNAME = import.meta.env.VITE_BOT_USERNAME as string | undefined;

type Stage = 'loading' | 'error' | 'menu' | 'confirmed';
type View = 'browse' | 'cart';
type CheckoutMessage = { type: 'error' | 'info'; text: string };

export default function App() {
  // MUHIM: bu yerda stol tokeni YO'Q. Yangi arxitekturada WebApp business
  // darajasida ochiladi (bot ?business=<business_code> yuboradi), stol esa
  // faqat checkout bosqichida (QR skaner orqali) aniqlanadi — pastga qarang.
  const businessCode = useMemo(
    () => new URLSearchParams(window.location.search).get('business') ?? '',
    [],
  );

  const [stage, setStage] = useState<Stage>('loading');
  const [view, setView] = useState<View>('browse');
  const [errorMessage, setErrorMessage] = useState('');
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Checkout (savat -> QR skaner -> buyurtma) holati
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<CheckoutMessage | null>(null);
  // Telegram tashqarisida (native skaner mavjud bo'lmaganda) faqat SINOV uchun —
  // productionda (haqiqiy Telegram'da) hech qachon ko'rinmaydi.
  const [devManualEntry, setDevManualEntry] = useState(false);
  const [devTokenInput, setDevTokenInput] = useState('');

  // Tasdiqlash ekrani uchun (buyurtma muvaffaqiyatli bo'lgandan keyin to'ldiriladi)
  const [lastOrderId, setLastOrderId] = useState('');
  const [lastOrderTotal, setLastOrderTotal] = useState(0);
  const [lastTableName, setLastTableName] = useState('');

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

  // Menyuni business_code bo'yicha yuklash — stol tokeni endi shart emas.
  useEffect(() => {
    if (!businessCode) {
      setErrorMessage('Restoran aniqlanmadi. Iltimos, botni /start orqali qayta oching.');
      setStage('error');
      return;
    }
    getMenuByBusinessCode(businessCode)
      .then((data) => {
        setMenu(data);
        setActiveCategory(data.categories[0]?.id ?? '');
        setStage('menu');
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

  // Savatda mahsulot bor paytda Mini App'ni tasodifan yopib qo'yishdan himoya
  useEffect(() => {
    if (!tg) return;
    if (cart.count > 0) tg.enableClosingConfirmation?.();
    else tg.disableClosingConfirmation?.();
  }, [cart.count]);

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

  // Telegram BackButton — savat ekranida va tasdiqlash ekranida "orqaga" ishorasi sifatida
  useEffect(() => {
    const btn = tg?.BackButton;
    if (!btn) return;
    if (view === 'cart' || stage === 'confirmed') btn.show();
    else btn.hide();
    const onClick = () => {
      if (stage === 'confirmed') {
        setStage('menu');
        return;
      }
      setView('browse');
    };
    btn.onClick(onClick);
    return () => btn.offClick(onClick);
  }, [view, stage]);

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
    setCheckoutMessage(null);
    try {
      const initData = tg?.initData ?? '';
      const items = cart.lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity }));
      const result = await createTelegramOrder(confirmedTableToken, initData, items);

      setLastOrderId(result.id);
      setLastOrderTotal(cart.total);
      setLastTableName('');
      // Tasdiqlash ekranida stol nomini ko'rsatish uchun best-effort so'rov — muvaffaqiyatsiz
      // bo'lsa ham buyurtma allaqachon qabul qilingan, shuning uchun xatoni yutib yuboramiz.
      getMenuByTableToken(confirmedTableToken)
        .then((data) => setLastTableName(data.table_name ?? ''))
        .catch(() => {});

      cart.clear();
      tg?.HapticFeedback?.notificationOccurred('success');
      tg?.disableClosingConfirmation?.();
      setStage('confirmed');
      setView('browse');
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

  // "Buyurtma berish" bosilganda Telegram'ning native QR-skaneri ochiladi — mijoz
  // stol ustidagi QR kodni skanerlaydi, shundan keyingina qaysi stol ekanligi
  // ma'lum bo'ladi va buyurtma shu stol uchun yuboriladi.
  //
  // Telegram tashqarisida (oddiy brauzerda sinashda) native skaner mavjud emas —
  // bu holatda faqat SINOV uchun kichik inline matn maydoni ko'rsatiladi (kamera
  // komponenti emas, oddiy input — productionda (haqiqiy Telegram'da) bu yo'l
  // umuman ko'rinmaydi, chunki initData bo'sh bo'lmaydi).
  function handleOrderButtonClick() {
    if (cart.count === 0) return;
    setCheckoutMessage(null);

    if (!tg?.initData || !tg.showScanQrPopup) {
      setDevManualEntry(true);
      return;
    }

    setScanning(true);

    const handlePopupClosed = () => {
      tg.offEvent('scanQrPopupClosed', handlePopupClosed);
      setScanning(false);
      setCheckoutMessage({
        type: 'info',
        text: "Skanerlash bekor qilindi. Buyurtma berish uchun qayta urinib ko'ring.",
      });
    };
    tg.onEvent('scanQrPopupClosed', handlePopupClosed);

    tg.showScanQrPopup(
      { text: 'Buyurtmani tasdiqlash uchun stolingizdagi QR kodni skanerlang' },
      (scannedText) => {
        const parsed = parseTableQr(scannedText, BOT_USERNAME);
        if (!parsed.ok) {
          setCheckoutMessage({
            type: 'error',
            text:
              parsed.reason === 'wrong_bot'
                ? 'Bu QR kod boshqa restoranga tegishli. Iltimos, aynan shu restoran stolidagi QR kodni skanerlang.'
                : 'Bu QR kod restoran stoliga tegishli emas. Iltimos, stolingizdagi QR kodni skanerlang.',
          });
          return false; // popup ochiq qoladi — mijoz qayta skanerlashi mumkin
        }

        tg.offEvent('scanQrPopupClosed', handlePopupClosed);
        tg.closeScanQrPopup?.();
        setScanning(false);
        submitOrder(parsed.tableToken);
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
    return (
      <ConfirmedScreen
        orderId={lastOrderId}
        total={lastOrderTotal}
        tableName={lastTableName}
        onOrderMore={() => setStage('menu')}
      />
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-[560px] bg-[var(--color-bg)]">
      {view === 'cart' ? (
        <CartScreen
          lines={cart.lines}
          total={cart.total}
          scanning={scanning}
          submitting={submitting}
          checkoutMessage={checkoutMessage}
          onBack={() => setView('browse')}
          onIncrement={cart.increment}
          onDecrement={cart.decrement}
          onSubmit={handleOrderButtonClick}
        />
      ) : (
        <div className="pb-28">
          <Header businessName={menu?.business_name ?? ''} />

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

      {/* Faqat Telegram tashqarisida (sinov uchun) — native QR-skaner o'rniga */}
      {devManualEntry && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xs rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-lg)]">
            <p className="mb-1 text-[13px] font-semibold text-[var(--color-text)]">
              (Test) Stol tokeni
            </p>
            <p className="mb-3 text-[12px] text-[var(--color-text-secondary)]">
              Telegram tashqarisida native QR-skaner mavjud emas — bu faqat sinov uchun.
            </p>
            <input
              type="text"
              autoFocus
              value={devTokenInput}
              onChange={(e) => setDevTokenInput(e.target.value)}
              placeholder="table token..."
              className="mb-3 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[14px] text-[var(--color-text)] outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setDevManualEntry(false);
                  setDevTokenInput('');
                }}
                className="flex-1 rounded-full border border-[var(--color-border)] py-2 text-[13px] text-[var(--color-text-secondary)]"
              >
                Bekor qilish
              </button>
              <button
                onClick={() => {
                  const value = devTokenInput.trim();
                  setDevManualEntry(false);
                  setDevTokenInput('');
                  if (value) submitOrder(value);
                }}
                className="flex-1 rounded-full bg-[var(--color-accent)] py-2 text-[13px] font-semibold text-[var(--color-accent-text)]"
              >
                Yuborish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
