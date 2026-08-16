import { useEffect, useRef, useState } from 'react';
import { createWebOrder, reverseGeocode } from '../api';
import type { CartLine, PaymentMethod } from '../types';
import { formatMoney } from '../utils/format';
import { getTelegramWebApp, isRunningInTelegram } from '../telegram';
import { parseTableQrUrl } from '../utils/qrParser';
import CartItem from '../components/CartItem';
import EmptyState from '../components/EmptyState';
import MapPicker from '../maps/MapPicker';

const tg = getTelegramWebApp();

type OnlineType = 'delivery' | 'pickup';

const ORDER_TYPES: { id: OnlineType; emoji: string; label: string; hint: string }[] = [
  { id: 'pickup', emoji: '🥡', label: 'Olib ketish', hint: 'O‘zingiz kelib olasiz' },
  { id: 'delivery', emoji: '🚚', label: 'Yetkazib berish', hint: 'Manzilingizga olib boramiz' },
];

const PAYMENT_METHODS: { id: PaymentMethod; emoji: string; label: string }[] = [
  { id: 'cash', emoji: '💵', label: 'Naqd' },
  { id: 'card', emoji: '💳', label: 'Karta' },
  { id: 'transfer', emoji: '📲', label: "O‘tkazma" },
];

/**
 * Veb buyurtma checkout'i: savat → ism/telefon → manzil (xarita) → to'lov
 * usuli → tasdiqlash.
 *
 * MANZIL BO'YICHA MUHIM QAROR: xarita manzilni faqat **taklif qiladi**, matn
 * maydoni esa doim tahrirlanadi. Sabab — OpenStreetMap O'zbekistonda uy
 * raqamlarini ko'pincha bilmaydi. Kuryerga aniq koordinata boradi, mijoz esa
 * "mo'ljal" maydoniga podyezd/qavat kabi tafsilotni yozadi.
 */
export default function WebCheckout({
  businessCode,
  businessName,
  orderTypes,
  lines,
  total,
  onBack,
  onIncrement,
  onDecrement,
  onOrdered,
  onTableFound,
}: {
  businessCode: string;
  businessName: string;
  // Superadmin har bir turni alohida yoqadi/o'chiradi (backend: order_types).
  // Kelmasa (masalan eski keshdagi javob) hammasi ochiq deb hisoblanadi —
  // FeatureEnabled'dagi "yozuv yo'q = yoqilgan" qoidasi bilan bir xil.
  orderTypes?: { dine_in: boolean; delivery: boolean; pickup: boolean };
  lines: CartLine[];
  total: number;
  onBack: () => void;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onOrdered: (publicToken: string) => void;
  // Stol QR kodi muvaffaqiyatli skanerlanganda chaqiriladi — WebMenu.tsx
  // buni mavjud stol-buyurtma marshrutiga (App.tsx, "/?table=...") o'tish
  // uchun ishlatadi. Bu ekran o'z savatini/holatini shu bilan tark etadi:
  // stol buyurtmasi butunlay boshqa, mustaqil oqim (App.tsx o'z menyusi,
  // o'z savati, o'z checkout'i bilan).
  onTableFound: (tableToken: string) => void;
}) {
  const availableOrderTypes = ORDER_TYPES.filter((t) => orderTypes?.[t.id] ?? true);
  const [orderType, setOrderType] = useState<OnlineType>(
    () => availableOrderTypes[0]?.id ?? 'delivery',
  );
  const [scanError, setScanError] = useState('');
  const canDineIn = Boolean(orderTypes?.dine_in ?? true) && Boolean(tg && isRunningInTelegram(tg) && tg.showScanQrPopup);

  // "🍽 Stolga buyurtma" bosilganda: mavjud fizik stol QR kodini Telegram'ning
  // o'z skaneri orqali o'qiydi. Stol raqamini qo'lda tanlash yo'q — faqat
  // haqiqiy QR orqali aniqlanadi (xavfsizlik: har kim istalgan stolga
  // "buyurtma qilaman" deb yozib qo'ymasligi uchun).
  function handleScanTable() {
    if (!tg?.showScanQrPopup) return;
    setScanError('');
    tg.showScanQrPopup({ text: 'Stolingizdagi QR kodni skanerlang' }, (scanned) => {
      const token = parseTableQrUrl(scanned);
      if (token) {
        onTableFound(token);
        return true; // popupni yopadi
      }
      setScanError("Bu QR kod restoranning stol kodi emas. Qayta urinib ko'ring.");
      return false; // popup ochiq qoladi, mijoz qayta skanerlashi mumkin
    });
  }

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [showMap, setShowMap] = useState(false);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mijoz manzilni qo'lda tahrirlagan bo'lsa, xaritadan kelgan taklif uni
  // **bosib ketmasligi** kerak — bu eng bezovta qiladigan xato bo'lardi.
  const addressTouched = useRef(false);

  // Ism va telefon brauzerda saqlanadi: takroriy buyurtmada qayta yozish shart emas.
  useEffect(() => {
    setName(localStorage.getItem('customer_name') ?? '');
    setPhone(localStorage.getItem('customer_phone') ?? '');
  }, []);

  // Xaritadagi nuqta o'zgarganda manzil taklifi yangilanadi.
  useEffect(() => {
    if (!point || addressTouched.current) return;
    let cancelled = false;
    // Surish tugagach biroz kutamiz — mijoz xaritani bir necha marta
    // surganda har safar so'rov yubormaslik uchun.
    const timer = setTimeout(() => {
      reverseGeocode(point.lat, point.lng).then((found) => {
        if (!cancelled && found && !addressTouched.current) setAddress(found);
      });
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [point]);

  function handleLocateMe() {
    if (!navigator.geolocation) {
      setError("Brauzeringiz joylashuvni aniqlashni qo'llab-quvvatlamaydi");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setShowMap(true);
        // Joylashuv aniqlangach xarita taklifi yana ishlashi kerak.
        addressTouched.current = false;
        setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        setShowMap(true);
        setError(
          "Joylashuvingizni avtomatik aniqlab bo'lmadi. Xarita orqali manzilingizni belgilang.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleSubmit() {
    setError(null);
    if (!name.trim()) return setError('Ismingizni kiriting');
    if (!phone.trim()) return setError('Telefon raqamingizni kiriting');
    if (orderType === 'delivery' && !address.trim() && !point) {
      return setError('Manzilni yozing yoki xaritada belgilang');
    }

    setSubmitting(true);
    try {
      localStorage.setItem('customer_name', name.trim());
      localStorage.setItem('customer_phone', phone.trim());

      const result = await createWebOrder({
        business_code: businessCode,
        order_type: orderType,
        customer_name: name.trim(),
        phone: phone.trim(),
        address: orderType === 'delivery' ? address.trim() : '',
        note: orderType === 'delivery' ? note.trim() : '',
        lat: orderType === 'delivery' ? (point?.lat ?? null) : null,
        lng: orderType === 'delivery' ? (point?.lng ?? null) : null,
        payment_method: payment,
        items: lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
      });

      // Kuzatuv havolasi saqlanadi — mijoz sahifani yopib qayta ochsa ham
      // buyurtmasini topa oladi.
      const saved = JSON.parse(localStorage.getItem('my_orders') ?? '[]') as string[];
      localStorage.setItem(
        'my_orders',
        JSON.stringify([result.public_token, ...saved].slice(0, 10)),
      );

      onOrdered(result.public_token);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Buyurtma yuborishda xatolik yuz berdi');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[560px] flex-col bg-[var(--color-bg)]">
      <header
        className="flex shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 pb-3"
        style={{ paddingTop: 'calc(var(--safe-top) + 12px)' }}
      >
        <button
          onClick={onBack}
          aria-label="Orqaga"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface)] text-base shadow-[var(--shadow-sm)] transition active:scale-90"
        >
          ←
        </button>
        <div>
          <h1 className="text-[17px] font-bold text-[var(--color-text)]">Buyurtmani rasmiylashtirish</h1>
          <p className="text-[12px] text-[var(--color-text-secondary)]">{businessName}</p>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {lines.length === 0 ? (
          <EmptyState emoji="🛒" title="Savat bo'sh" subtitle="Menyudan mahsulot tanlang" />
        ) : availableOrderTypes.length === 0 && !canDineIn ? (
          <EmptyState
            emoji="🚫"
            title="Uydan buyurtma vaqtincha to'xtatilgan"
            subtitle="Iltimos, restoranga bog'laning yoki keyinroq qayta urinib ko'ring"
          />
        ) : (
          <>
            <section className="divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-surface)] px-3">
              {lines.map((line) => (
                <CartItem
                  key={line.product.id}
                  line={line}
                  onIncrement={onIncrement}
                  onDecrement={onDecrement}
                />
              ))}
            </section>

            <Section title="Buyurtma turi">
              <div className="space-y-2">
                {canDineIn && (
                  <button
                    onClick={handleScanTable}
                    className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border-2 border-dashed border-[var(--color-accent)] bg-[var(--color-surface)] p-3 text-left transition active:scale-[0.98]"
                  >
                    <span className="text-2xl">🍽</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-[var(--color-text)]">
                        Stolga buyurtma
                      </p>
                      <p className="text-[12px] text-[var(--color-text-secondary)]">
                        QR orqali stolni aniqlash
                      </p>
                    </div>
                  </button>
                )}
                {scanError && (
                  <p className="text-[12px] text-[var(--color-danger)]">{scanError}</p>
                )}
                {availableOrderTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setOrderType(type.id)}
                    className={`flex w-full items-center gap-3 rounded-[var(--radius-md)] border-2 p-3 text-left transition ${
                      orderType === type.id
                        ? 'border-[var(--color-accent)] bg-[var(--color-surface)]'
                        : 'border-transparent bg-[var(--color-surface)]'
                    }`}
                  >
                    <span className="text-2xl">{type.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold text-[var(--color-text)]">
                        {type.label}
                      </p>
                      <p className="text-[12px] text-[var(--color-text-secondary)]">{type.hint}</p>
                    </div>
                    {orderType === type.id && <span className="text-[var(--color-accent)]">✓</span>}
                  </button>
                ))}
              </div>
            </Section>

            {availableOrderTypes.length > 0 && (
              <>
                <Section title="Aloqa">
                  <div className="space-y-2">
                    <Input value={name} onChange={setName} placeholder="Ismingiz" />
                    <Input
                      value={phone}
                      onChange={setPhone}
                      placeholder="Telefon raqamingiz (+998 ...)"
                      type="tel"
                    />
                  </div>
                </Section>

                {orderType === 'delivery' && (
                  <Section title="Yetkazib berish manzili">
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <button
                          onClick={handleLocateMe}
                          disabled={locating}
                          className="flex-1 rounded-full bg-[var(--color-accent)] px-3 py-2.5 text-[13px] font-semibold text-[var(--color-accent-text)] disabled:opacity-60"
                        >
                          {locating ? 'Joylashuv aniqlanmoqda...' : '📍 Mening joylashuvim'}
                        </button>
                        <button
                          onClick={() => setShowMap((v) => !v)}
                          className="rounded-full border border-[var(--color-border)] px-3 py-2.5 text-[13px] text-[var(--color-text-secondary)]"
                        >
                          {showMap ? 'Xaritani yopish' : 'Xaritadan tanlash'}
                        </button>
                      </div>

                      {showMap && (
                        <>
                          <MapPicker value={point} onChange={setPoint} />
                          <p className="text-[11.5px] text-[var(--color-text-secondary)]">
                            Xaritani suring — nishon turgan joy sizning manzilingiz bo'ladi.
                          </p>
                        </>
                      )}

                      {/* Manzil matni har doim tahrirlanadi: xarita uni faqat
                          taklif qiladi va ko'pincha uy raqamini bilmaydi. */}
                      <Input
                        value={address}
                        onChange={(v) => {
                          addressTouched.current = true;
                          setAddress(v);
                        }}
                        placeholder="Ko'cha, uy raqami"
                      />
                      <Input
                        value={note}
                        onChange={setNote}
                        placeholder="Mo'ljal: podyezd, qavat, domofon"
                      />
                    </div>
                  </Section>
                )}

                <Section title="To'lov usuli">
                  <div className="grid grid-cols-3 gap-2">
                    {PAYMENT_METHODS.map((method) => (
                      <button
                        key={method.id}
                        onClick={() => setPayment(method.id)}
                        className={`rounded-[var(--radius-md)] border-2 px-2 py-3 text-center transition ${
                          payment === method.id
                            ? 'border-[var(--color-accent)] bg-[var(--color-surface)]'
                            : 'border-transparent bg-[var(--color-surface)]'
                        }`}
                      >
                        <span className="block text-xl">{method.emoji}</span>
                        <span className="mt-1 block text-[12.5px] font-medium text-[var(--color-text)]">
                          {method.label}
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11.5px] text-[var(--color-text-secondary)]">
                    To'lov buyurtmani qabul qilganda amalga oshiriladi.
                  </p>
                </Section>
              </>
            )}
          </>
        )}
      </div>

      {lines.length > 0 && availableOrderTypes.length > 0 && (
        <div
          className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-bg)] px-4 pt-3"
          style={{ paddingBottom: 'calc(var(--safe-bottom) + 14px)' }}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[15px] font-semibold text-[var(--color-text)]">Jami</span>
            <span className="text-[19px] font-bold text-[var(--color-text)]">
              {formatMoney(total)} so'm
            </span>
          </div>
          {error && (
            <p className="mb-3 rounded-[var(--radius-sm)] bg-red-500/10 px-3 py-2 text-[13px] text-[var(--color-danger)]">
              {error}
            </p>
          )}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex h-13 w-full items-center justify-center rounded-full bg-[var(--color-accent)] py-3.5 text-[16px] font-semibold text-[var(--color-accent-text)] shadow-[var(--shadow-md)] transition active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? 'Yuborilmoqda...' : 'Buyurtmani tasdiqlash'}
          </button>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[13px] font-semibold text-[var(--color-text-secondary)]">{title}</h2>
      {children}
    </section>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[14px] text-[var(--color-text)] outline-none"
    />
  );
}
