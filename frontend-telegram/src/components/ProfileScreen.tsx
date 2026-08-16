import { useEffect, useState } from 'react';
import { getTelegramProfile, updateTelegramProfile } from '../api';
import { getTelegramWebApp } from '../telegram';
import type { ProfileOrder, ProfileResponse } from '../types';
import { formatMoney } from '../utils/format';
import EmptyState from './EmptyState';

/**
 * MIJOZ PROFILI — Mini App ichidagi "mening sahifam".
 *
 * Ikki vazifasi bor:
 *
 *  1. **Buyurtmalar tarixi.** Mijoz oldin nima buyurtma qilganini ko'radi —
 *     stoldagi ham, uydan berilgani ham. Uydan berilgan buyurtmada kuzatuv
 *     havolasi bo'ladi (public_token), stol buyurtmasida yo'q.
 *
 *  2. **Saqlangan ma'lumot.** Telefon va manzil bir marta kiritilsa,
 *     keyingi checkout o'zi to'ladi. Ilgari mijoz har buyurtmada hammasini
 *     boshidan yozardi.
 *
 * Ism va @username tahrirlanmaydi: ular Telegram'ning o'z ma'lumoti va
 * har buyurtmada serverda qayta yoziladi (backend: upsertTelegramCustomer).
 * Tahrirlashga ruxsat berilsa, keyingi buyurtmada jimgina qaytib ketardi.
 */

const tg = getTelegramWebApp();

// Bazadagi ikkita ustunni (status + kitchen_status) bitta yorliqqa
// aylantiradi — OrderTracking.tsx dagi currentStepKey bilan bir xil mantiq,
// faqat ro'yxat uchun qisqartirilgan ko'rinishda.
function orderStatusLabel(order: ProfileOrder): { emoji: string; text: string; tone: string } {
  if (order.status === 'cancelled') {
    return { emoji: '❌', text: 'Bekor qilingan', tone: 'text-[var(--color-danger)]' };
  }
  if (order.status === 'paid') {
    return { emoji: '✅', text: 'Yakunlangan', tone: 'text-[var(--color-text-secondary)]' };
  }
  if (order.status === 'new') {
    return { emoji: '⏳', text: 'Tasdiq kutilmoqda', tone: 'text-[var(--color-accent)]' };
  }
  switch (order.kitchen_status) {
    case 'ready':
      return { emoji: '🍽️', text: 'Tayyor', tone: 'text-[var(--color-accent)]' };
    case 'delivering':
      return { emoji: '🚚', text: 'Yo\'lda', tone: 'text-[var(--color-accent)]' };
    case 'delivered':
      return { emoji: '📦', text: 'Yetkazildi', tone: 'text-[var(--color-text-secondary)]' };
    default:
      return { emoji: '👨‍🍳', text: 'Tayyorlanmoqda', tone: 'text-[var(--color-accent)]' };
  }
}

function orderPlaceLabel(order: ProfileOrder): string {
  if (order.table_name) return order.table_name;
  if (order.order_type === 'delivery') return '🚚 Yetkazib berish';
  if (order.order_type === 'pickup') return '🥡 Olib ketish';
  return 'Buyurtma';
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('uz-UZ', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ProfileScreen({
  businessCode,
  onBack,
  onOpenOrder,
}: {
  businessCode: string;
  onBack: () => void;
  /** Kuzatuv sahifasiga o'tish (faqat uydan berilgan buyurtmalarda). */
  onOpenOrder: (publicToken: string) => void;
}) {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [failed, setFailed] = useState(false);

  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getTelegramProfile(businessCode)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setPhone(result.profile.phone ?? '');
        setAddress(result.profile.delivery_address ?? '');
        setNote(result.profile.delivery_note ?? '');
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [businessCode]);

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      await updateTelegramProfile(businessCode, {
        phone: phone.trim(),
        delivery_address: address.trim(),
        delivery_note: note.trim(),
      });
      // Serverga borib qaytmaymiz: yuborilgan qiymatlar allaqachon qo'lda,
      // qolgan maydonlar (statistika, tarix) o'zgarmadi.
      setData((current) =>
        current
          ? {
              ...current,
              profile: {
                ...current.profile,
                phone: phone.trim() || null,
                delivery_address: address.trim() || null,
                delivery_note: note.trim() || null,
              },
            }
          : current,
      );
      setEditing(false);
      tg?.HapticFeedback?.notificationOccurred('success');
    } catch (err: any) {
      tg?.HapticFeedback?.notificationOccurred('error');
      setSaveError(err?.response?.data?.error ?? "Saqlab bo'lmadi. Qayta urinib ko'ring.");
    } finally {
      setSaving(false);
    }
  }

  if (failed) {
    return (
      <div className="mx-auto min-h-screen max-w-[560px] bg-[var(--color-bg)]">
        <ProfileHeader onBack={onBack} />
        <EmptyState
          emoji="😕"
          title="Profilni yuklab bo'lmadi"
          subtitle="Ilovani Telegram orqali oching"
          isError
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto min-h-screen max-w-[560px] bg-[var(--color-bg)]">
        <ProfileHeader onBack={onBack} />
        <div className="space-y-3 px-4">
          <div className="skeleton-shimmer h-20 rounded-[var(--radius-md)]" />
          <div className="skeleton-shimmer h-32 rounded-[var(--radius-md)]" />
        </div>
      </div>
    );
  }

  const { profile, orders } = data;
  const photoUrl = tg?.initDataUnsafe?.user?.photo_url;
  const initial = profile.full_name.trim().charAt(0).toUpperCase() || '👤';

  return (
    <div className="mx-auto min-h-screen max-w-[560px] bg-[var(--color-bg)] pb-10">
      <ProfileHeader onBack={onBack} />

      {/* --- Shaxs --- */}
      <section className="mx-4 flex items-center gap-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-xl font-bold text-[var(--color-accent-text)]">
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold text-[var(--color-text)]">
            {profile.full_name || 'Mijoz'}
          </p>
          {profile.username && (
            <p className="truncate text-[13px] text-[var(--color-text-secondary)]">
              @{profile.username}
            </p>
          )}
        </div>
      </section>

      {/* --- Statistika: faqat buyurtma bo'lsa ma'noli --- */}
      {profile.orders_count > 0 && (
        <section className="mx-4 mt-3 flex gap-3">
          <StatCard label="Buyurtmalar" value={String(profile.orders_count)} />
          <StatCard label="Sarflangan" value={`${formatMoney(profile.total_spent)} so'm`} />
        </section>
      )}

      {/* --- Saqlangan ma'lumot --- */}
      <section className="mx-4 mt-3 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[var(--color-text)]">Mening ma'lumotlarim</h2>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-[13px] font-medium text-[var(--color-accent)]"
            >
              Tahrirlash
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-2">
            <Field
              value={phone}
              onChange={setPhone}
              placeholder="Telefon raqamingiz (+998 ...)"
              type="tel"
            />
            <Field value={address} onChange={setAddress} placeholder="Yetkazib berish manzili" />
            <Field value={note} onChange={setNote} placeholder="Mo'ljal (2-podyezd, 4-qavat)" />
            {saveError && <p className="text-[12px] text-[var(--color-danger)]">{saveError}</p>}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-full bg-[var(--color-accent)] px-4 py-2.5 text-[14px] font-semibold text-[var(--color-accent-text)] transition active:scale-95 disabled:opacity-60"
              >
                {saving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
              <button
                onClick={() => {
                  // Bekor qilinganda serverdagi holatga qaytariladi.
                  setPhone(profile.phone ?? '');
                  setAddress(profile.delivery_address ?? '');
                  setNote(profile.delivery_note ?? '');
                  setSaveError('');
                  setEditing(false);
                }}
                className="rounded-full border border-[var(--color-border)] px-4 py-2.5 text-[14px] text-[var(--color-text-secondary)]"
              >
                Bekor
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <InfoRow icon="📞" value={profile.phone} empty="Telefon kiritilmagan" />
            <InfoRow icon="📍" value={profile.delivery_address} empty="Manzil kiritilmagan" />
            {profile.delivery_note && <InfoRow icon="💬" value={profile.delivery_note} empty="" />}
            <p className="pt-1 text-[11.5px] text-[var(--color-text-secondary)]">
              Bu ma'lumot buyurtma berishda avtomatik to'ldiriladi.
            </p>
          </div>
        )}
      </section>

      {/* --- Buyurtmalar tarixi --- */}
      <section className="mx-4 mt-4">
        <h2 className="mb-2 text-[13px] font-semibold text-[var(--color-text-secondary)]">
          Mening buyurtmalarim
        </h2>

        {orders.length === 0 ? (
          <EmptyState
            emoji="🧾"
            title="Hozircha buyurtma yo'q"
            subtitle="Birinchi buyurtmangiz shu yerda ko'rinadi"
          />
        ) : (
          <ul className="space-y-2">
            {orders.map((order) => {
              const status = orderStatusLabel(order);
              const trackable = Boolean(order.public_token);
              return (
                <li key={order.id}>
                  <button
                    onClick={() => order.public_token && onOpenOrder(order.public_token)}
                    disabled={!trackable}
                    className="w-full rounded-[var(--radius-md)] bg-[var(--color-surface)] p-3.5 text-left shadow-[var(--shadow-sm)] transition disabled:cursor-default enabled:active:scale-[0.99]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-[var(--color-text)]">
                          {orderPlaceLabel(order)}
                        </p>
                        <p className="text-[12px] text-[var(--color-text-secondary)]">
                          {formatDate(order.created_at)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[14px] font-bold text-[var(--color-text)]">
                          {formatMoney(order.final_amount)}
                        </p>
                        <p className={`text-[11.5px] ${status.tone}`}>
                          {status.emoji} {status.text}
                        </p>
                      </div>
                    </div>

                    {order.items.length > 0 && (
                      <p className="mt-1.5 truncate text-[12.5px] text-[var(--color-text-secondary)]">
                        {order.items
                          .map((item) => `${item.product_name} × ${item.quantity}`)
                          .join(', ')}
                      </p>
                    )}

                    {trackable && (
                      <p className="mt-1 text-[12px] font-medium text-[var(--color-accent)]">
                        Kuzatish →
                      </p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function ProfileHeader({ onBack }: { onBack: () => void }) {
  return (
    <header
      className="flex items-center gap-3 px-4 pb-3"
      style={{ paddingTop: 'calc(var(--safe-top) + 12px)' }}
    >
      <button
        onClick={onBack}
        aria-label="Orqaga"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface)] text-base shadow-[var(--shadow-sm)] transition active:scale-90"
      >
        ←
      </button>
      <h1 className="truncate text-[17px] font-bold text-[var(--color-text)]">Profil</h1>
    </header>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-[var(--radius-md)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-sm)]">
      <p className="text-[11.5px] text-[var(--color-text-secondary)]">{label}</p>
      <p className="truncate text-[15px] font-bold text-[var(--color-text)]">{value}</p>
    </div>
  );
}

function InfoRow({ icon, value, empty }: { icon: string; value: string | null; empty: string }) {
  return (
    <p className="flex gap-2 text-[13.5px]">
      <span className="shrink-0">{icon}</span>
      <span className={value ? 'text-[var(--color-text)]' : 'text-[var(--color-text-secondary)]'}>
        {value || empty}
      </span>
    </p>
  );
}

function Field({
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
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      type={type}
      className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-[14px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
    />
  );
}
