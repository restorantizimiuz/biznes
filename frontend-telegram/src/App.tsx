import { useEffect, useMemo, useRef, useState } from 'react';
import { createTelegramOrder, getMenuByTableToken } from './api';
import { getTelegramWebApp } from './telegram';
import type { MenuResponse } from './types';

const tg = getTelegramWebApp();

function formatMoney(amount: number) {
  return amount.toLocaleString('uz-UZ');
}

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

type Stage = 'loading' | 'error' | 'menu' | 'submitting' | 'confirmed';

export default function App() {
  const tableToken = useMemo(
    () => new URLSearchParams(window.location.search).get('table') ?? '',
    [],
  );

  const [stage, setStage] = useState<Stage>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [lastOrderTotal, setLastOrderTotal] = useState(0);
  const [activeCategory, setActiveCategory] = useState<string>('');

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const pillRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    tg?.ready();
    tg?.expand();
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

  // Foydalanuvchi menyuni pastga aylantirganda, hozir ko'rinib turgan
  // kategoriyaga mos pastki yorliq avtomatik yoritiladi (scroll-spy).
  useEffect(() => {
    if (stage !== 'menu' || !menu) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-category-id');
            if (id) setActiveCategory(id);
          }
        }
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 },
    );
    for (const cat of menu.categories) {
      const el = sectionRefs.current[cat.id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [stage, menu]);

  useEffect(() => {
    pillRefs.current[activeCategory]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [activeCategory]);

  const products = useMemo(() => {
    const map: Record<string, { name: string; price: number }> = {};
    for (const cat of menu?.categories ?? []) {
      for (const p of cat.products) {
        map[p.id] = { name: p.name, price: p.price };
      }
    }
    return map;
  }, [menu]);

  const cartItems = Object.entries(cart).filter(([, qty]) => qty > 0);
  const cartCount = cartItems.reduce((sum, [, qty]) => sum + qty, 0);
  const cartTotal = cartItems.reduce((sum, [id, qty]) => sum + (products[id]?.price ?? 0) * qty, 0);

  function setQuantity(productId: string, quantity: number) {
    setCart((c) => ({ ...c, [productId]: Math.max(0, quantity) }));
  }

  function scrollToCategory(id: string) {
    setActiveCategory(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function submitOrder(confirmedTableToken: string) {
    if (cartCount === 0) return;
    setStage('submitting');
    try {
      const initData = tg?.initData ?? '';
      const items = cartItems.map(([product_id, quantity]) => ({ product_id, quantity }));
      await createTelegramOrder(confirmedTableToken, initData, items);
      setLastOrderTotal(cartTotal);
      setCart({});
      tg?.HapticFeedback?.notificationOccurred('success');
      setStage('confirmed');
    } catch (err: any) {
      tg?.HapticFeedback?.notificationOccurred('error');
      setErrorMessage(err?.response?.data?.error ?? 'Buyurtma yuborishda xatolik yuz berdi');
      setStage('menu');
    }
  }

  // "Buyurtma berish" bosilganda avval stol QR kodini skanerlashni so'raymiz —
  // shu orqali mijoz haqiqatan ham stol yonida ekanligi tasdiqlanadi.
  // Telegram'ning WebApp skripti tashqi (oddiy) brauzerda ham yuklanadi va
  // showScanQrPopup funksiyasi mavjud bo'lib ko'rinadi, lekin haqiqiy Telegram
  // ilovasisiz ishlamaydi — shuning uchun buning o'rniga `initData` borligini
  // tekshiramiz: u faqat botdan chinakam ochilganda to'ldiriladi.
  function handleOrderButtonClick() {
    if (cartCount === 0) return;
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
          setErrorMessage("Bu stol QR kodi emas. Iltimos, aynan stolingizdagi QR kodni skanerlang.");
          return false;
        }
        tg.closeScanQrPopup?.();
        submitOrder(scannedToken);
        return true;
      },
    );
  }

  // Telegram MainButton'ni savat holatiga qarab boshqarish
  useEffect(() => {
    const btn = tg?.MainButton;
    if (!btn) return;
    if (stage === 'menu' && cartCount > 0) {
      btn.setText(`Buyurtma berish — ${formatMoney(cartTotal)} so'm`);
      btn.show();
      btn.enable();
    } else {
      btn.hide();
    }
    btn.onClick(handleOrderButtonClick);
    return () => btn.offClick(handleOrderButtonClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, cartCount, cartTotal]);

  if (stage === 'loading') {
    return <FullScreenState emoji="🍽️" text="Menyu yuklanmoqda..." />;
  }

  if (stage === 'error') {
    return <FullScreenState emoji="😕" text={errorMessage} isError />;
  }

  if (stage === 'confirmed') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-b from-orange-50 to-white p-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl">
          ✅
        </div>
        <h1 className="text-xl font-bold text-stone-900">Buyurtmangiz qabul qilindi!</h1>
        <p className="max-w-xs text-sm text-stone-500">
          Jami:{' '}
          <span className="font-semibold text-stone-800">{formatMoney(lastOrderTotal)} so'm</span>.
          Ofitsiant/kassa buyurtmangizni tez orada tayyorlashni boshlaydi.
        </p>
        <button
          onClick={() => setStage('menu')}
          className="mt-4 rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-200 hover:bg-orange-600 active:scale-95"
        >
          Yana buyurtma qo'shish
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-32">
      {/* Header */}
      <header className="bg-gradient-to-br from-orange-500 to-amber-500 px-5 pb-6 pt-5 text-white">
        <h1 className="text-lg font-bold">{menu?.business_name}</h1>
        <p className="text-sm text-orange-50/90">📍 {menu?.table_name}</p>
      </header>

      {/* Category pills */}
      {menu && menu.categories.length > 1 && (
        <div className="sticky top-0 z-10 -mt-4 border-b border-stone-100 bg-white/95 px-3 py-3 backdrop-blur">
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-2">
            {menu.categories.map((cat) => (
              <button
                key={cat.id}
                ref={(el) => {
                  pillRefs.current[cat.id] = el;
                }}
                onClick={() => scrollToCategory(cat.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition ${
                  activeCategory === cat.id
                    ? 'bg-orange-500 text-white shadow-md shadow-orange-200'
                    : 'bg-stone-100 text-stone-600'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {errorMessage && (
        <p className="mx-4 mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
          {errorMessage}
        </p>
      )}

      <div className="space-y-7 px-4 pt-5">
        {menu?.categories.map((cat) => (
          <section
            key={cat.id}
            data-category-id={cat.id}
            ref={(el) => {
              sectionRefs.current[cat.id] = el;
            }}
            className="scroll-mt-24"
          >
            <h2 className="mb-3 text-base font-bold text-stone-900">{cat.name}</h2>
            <div className="grid grid-cols-2 gap-3">
              {cat.products.map((p) => (
                <ProductCard
                  key={p.id}
                  name={p.name}
                  description={p.description}
                  price={p.price}
                  imageUrl={p.image_url}
                  quantity={cart[p.id] ?? 0}
                  onChange={(q) => setQuantity(p.id, q)}
                />
              ))}
            </div>
          </section>
        ))}
        {menu?.categories.length === 0 && (
          <p className="pt-10 text-center text-sm text-stone-400">Hozircha menyu bo'sh</p>
        )}
      </div>

      {/* Telegram tashqarisida (oddiy brauzerda) sinash uchun zaxira tugma —
          Telegram ichida buning o'rniga native MainButton ko'rinadi. Telegram'ning
          WebApp skripti oddiy brauzerda ham yuklanadi, shuning uchun obyekt
          mavjudligi emas, `initData` to'ldirilganligi tekshiriladi. */}
      {!tg?.initData && cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-stone-200 bg-white/95 p-3 backdrop-blur">
          <button
            onClick={handleOrderButtonClick}
            disabled={stage === 'submitting'}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-orange-500 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-orange-200 hover:bg-orange-600 disabled:opacity-60"
          >
            {stage === 'submitting' ? (
              'Yuborilmoqda...'
            ) : (
              <>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25 text-xs">
                  {cartCount}
                </span>
                Buyurtma berish — {formatMoney(cartTotal)} so'm
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function ProductCard({
  name,
  description,
  price,
  imageUrl,
  quantity,
  onChange,
}: {
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  quantity: number;
  onChange: (q: number) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = imageUrl && !imgFailed;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm shadow-stone-200/60 ring-1 ring-stone-100">
      <div className="relative aspect-square w-full overflow-hidden bg-stone-100">
        {showImage ? (
          <img
            src={imageUrl}
            alt={name}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center bg-gradient-to-br text-3xl ${placeholderGradient(name)}`}
          >
            🍽️
          </div>
        )}
        {quantity === 0 ? (
          <button
            onClick={() => onChange(1)}
            className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg font-semibold text-orange-500 shadow-md active:scale-90"
          >
            +
          </button>
        ) : (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-white px-1 py-1 shadow-md">
            <button
              onClick={() => onChange(quantity - 1)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-orange-500 active:scale-90"
            >
              −
            </button>
            <span className="w-4 text-center text-xs font-semibold text-stone-900">{quantity}</span>
            <button
              onClick={() => onChange(quantity + 1)}
              className="flex h-6 w-6 items-center justify-center rounded-full text-orange-500 active:scale-90"
            >
              +
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-1 text-sm font-semibold text-stone-900">{name}</p>
        {description && (
          <p className="line-clamp-2 text-xs leading-snug text-stone-400">{description}</p>
        )}
        <p className="mt-auto pt-1 text-sm font-bold text-orange-600">{formatMoney(price)} so'm</p>
      </div>
    </div>
  );
}

function FullScreenState({
  emoji,
  text,
  isError,
}: {
  emoji: string;
  text: string;
  isError?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="text-4xl">{emoji}</div>
      <p className={`text-sm ${isError ? 'text-red-600' : 'text-stone-500'}`}>{text}</p>
    </div>
  );
}
