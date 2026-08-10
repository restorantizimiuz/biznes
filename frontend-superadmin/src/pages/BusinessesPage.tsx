import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBusiness,
  getStats,
  listBusinesses,
  setFeature,
  setSubscription,
  updateBusiness,
} from '../api/endpoints';
import {
  FEATURE_KEYS,
  FEATURE_LABELS,
  PLAN_LABELS,
  type Business,
  type CreateBusinessBody,
  type SubscriptionPlan,
} from '../api/types';
import ModalShell from '../components/ModalShell';

const PLANS: SubscriptionPlan[] = ['basic', 'qr', 'full'];

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

export default function BusinessesPage() {
  const queryClient = useQueryClient();
  const { data: stats } = useQuery({ queryKey: ['platform-stats'], queryFn: getStats });
  const { data: businesses = [] } = useQuery({
    queryKey: ['platform-businesses'],
    queryFn: listBusinesses,
  });

  const [openBusinessId, setOpenBusinessId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Ochiq oyna ma'lumoti yangilanishdan keyin ham dolzarb bo'lishi uchun
  // ID orqali qayta topiladi.
  const openBusiness = businesses.find((b) => b.id === openBusinessId) ?? null;

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['platform-businesses'] });
    queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
  }

  return (
    <div>
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Kafelar" value={stats.total_businesses} />
          <StatCard label="Faol kafelar" value={stats.active_businesses} />
          <StatCard label="Xodimlar" value={stats.total_users} />
          <StatCard label="Bugungi buyurtma" value={stats.orders_today} />
          <StatCard label="Bugungi tushum" value={stats.revenue_today.toLocaleString()} />
        </div>
      )}

      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Kafelar</h1>
        <button
          onClick={() => setCreating(true)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Yangi kafe
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Kafe</th>
              <th className="px-3 py-2 font-medium">Kod</th>
              <th className="px-3 py-2 font-medium">Obuna</th>
              <th className="px-3 py-2 font-medium">Stollar</th>
              <th className="px-3 py-2 font-medium">Ofitsiant</th>
              <th className="px-3 py-2 font-medium">Kassir</th>
              <th className="px-3 py-2 font-medium">Oxirgi faollik</th>
              <th className="px-3 py-2 font-medium">Holat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {businesses.map((b) => (
              <tr
                key={b.id}
                onClick={() => setOpenBusinessId(b.id)}
                className="cursor-pointer hover:bg-slate-50"
              >
                <td className="px-3 py-2 font-medium text-slate-900">{b.name}</td>
                <td className="px-3 py-2 text-slate-500">{b.business_code}</td>
                <td className="px-3 py-2 text-slate-600">
                  {b.subscription_plan ? PLAN_LABELS[b.subscription_plan] : '—'}
                  <span className="block text-xs text-slate-400">
                    {formatDate(b.subscription_ends_at)} gacha
                  </span>
                </td>
                {/* Limitga yaqinlashgan qiymatlar ajratib ko'rsatiladi */}
                <LimitCell used={b.table_count} limit={b.max_tables} />
                <LimitCell used={b.waiter_count} limit={b.max_waiters} />
                <LimitCell used={b.cashier_count} limit={b.max_cashiers} />
                <td className="px-3 py-2 text-slate-500">{formatDate(b.last_activity_at)}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      b.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {b.is_active ? 'Faol' : "To'xtatilgan"}
                  </span>
                </td>
              </tr>
            ))}
            {businesses.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-400">
                  Hali kafe qo'shilmagan
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {openBusiness && (
        <BusinessDetailModal
          business={openBusiness}
          onClose={() => setOpenBusinessId(null)}
          onChanged={refresh}
        />
      )}

      {creating && (
        <CreateBusinessModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            refresh();
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      <p className="text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function LimitCell({ used, limit }: { used: number; limit: number }) {
  const full = used >= limit;
  return (
    <td className={`px-3 py-2 ${full ? 'font-semibold text-amber-700' : 'text-slate-600'}`}>
      {used} / {limit}
    </td>
  );
}

function BusinessDetailModal({
  business,
  onClose,
  onChanged,
}: {
  business: Business;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(business.name);
  const [maxTables, setMaxTables] = useState(business.max_tables);
  const [maxWaiters, setMaxWaiters] = useState(business.max_waiters);
  const [maxCashiers, setMaxCashiers] = useState(business.max_cashiers);
  const [plan, setPlan] = useState<SubscriptionPlan>(business.subscription_plan ?? 'basic');
  const [durationDays, setDurationDays] = useState(30);
  const [message, setMessage] = useState<string | null>(null);

  function handleError(err: any) {
    setMessage(err?.response?.data?.error ?? 'Xatolik yuz berdi');
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      updateBusiness(business.id, {
        name: name.trim(),
        max_tables: maxTables,
        max_waiters: maxWaiters,
        max_cashiers: maxCashiers,
      }),
    onSuccess: () => {
      onChanged();
      setMessage('Saqlandi');
    },
    onError: handleError,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: () => updateBusiness(business.id, { is_active: !business.is_active }),
    onSuccess: onChanged,
    onError: handleError,
  });

  const subscriptionMutation = useMutation({
    mutationFn: () =>
      setSubscription(business.id, { plan, status: 'active', duration_days: durationDays }),
    onSuccess: () => {
      onChanged();
      setMessage('Obuna yangilandi');
    },
    onError: handleError,
  });

  const featureMutation = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      setFeature(business.id, key, enabled),
    onSuccess: onChanged,
    onError: handleError,
  });

  return (
    <ModalShell title={business.name} subtitle={business.business_code} onClose={onClose}>
      <div className="space-y-5">
        {message && (
          <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{message}</p>
        )}

        <section className="space-y-3 rounded-lg border border-slate-200 p-3">
          <h3 className="text-sm font-semibold text-slate-800">Kafe va limitlar</h3>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Nomi</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <LimitInput label="Stollar" value={maxTables} onChange={setMaxTables} />
            <LimitInput label="Ofitsiant" value={maxWaiters} onChange={setMaxWaiters} />
            <LimitInput label="Kassir" value={maxCashiers} onChange={setMaxCashiers} />
          </div>
          <p className="text-xs text-slate-400">
            Limit backendda majburlanadi: limitdan oshganda kafe yangi stol yoki xodim qo'sha
            olmaydi.
          </p>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            Saqlash
          </button>
        </section>

        <section className="space-y-2 rounded-lg border border-slate-200 p-3">
          <h3 className="text-sm font-semibold text-slate-800">Funksiyalar</h3>
          <p className="text-xs text-slate-400">
            O'chirilgan funksiya endpointi 403 qaytaradi — masalan online buyurtma o'chirilsa,
            mijoz Telegram ilovasidan buyurtma bera olmaydi.
          </p>
          <div className="space-y-1.5">
            {FEATURE_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-3 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={business.features[key] ?? true}
                  onChange={(e) =>
                    featureMutation.mutate({ key, enabled: e.target.checked })
                  }
                  className="h-4 w-4"
                />
                {FEATURE_LABELS[key]}
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-slate-200 p-3">
          <h3 className="text-sm font-semibold text-slate-800">Obuna</h3>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Tarif</span>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as SubscriptionPlan)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {PLANS.map((p) => (
                  <option key={p} value={p}>
                    {PLAN_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Muddat (kun)</span>
              <input
                type="number"
                min={1}
                value={durationDays}
                onChange={(e) => setDurationDays(Math.max(1, Number(e.target.value)))}
                className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <button
              onClick={() => subscriptionMutation.mutate()}
              disabled={subscriptionMutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              Belgilash
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-red-200 bg-red-50/50 p-3">
          <h3 className="mb-1 text-sm font-semibold text-red-700">Kafeni to'xtatish</h3>
          <p className="mb-2 text-xs text-red-600">
            To'xtatilgan kafe xodimlari tizimga kira olmaydi. Ma'lumotlar o'chirilmaydi.
          </p>
          <button
            onClick={() => toggleActiveMutation.mutate()}
            disabled={toggleActiveMutation.isPending}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${
              business.is_active ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {business.is_active ? "Vaqtincha to'xtatish" : 'Qayta yoqish'}
          </button>
        </section>
      </div>
    </ModalShell>
  );
}

function LimitInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value)))}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
    </label>
  );
}

function CreateBusinessModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<CreateBusinessBody>({
    business_code: '',
    name: '',
    type: 'cafe',
    phone: '',
    owner_full_name: '',
    owner_login: '',
    owner_password: '',
    plan: 'basic',
    duration_days: 30,
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => createBusiness(form),
    onSuccess: onCreated,
    onError: (err: any) => setError(err?.response?.data?.error ?? 'Xatolik yuz berdi'),
  });

  function field(key: keyof CreateBusinessBody, label: string, type = 'text') {
    return (
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
        <input
          type={type}
          value={String(form[key])}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
    );
  }

  return (
    <ModalShell title="Yangi kafe" subtitle="Kafe, egasining hisobi va obuna birga yaratiladi" onClose={onClose}>
      <div className="space-y-3">
        {field('name', 'Kafe nomi')}
        {field('business_code', 'Kafe kodi (login vaqtida "server" sifatida kiritiladi)')}
        {field('phone', 'Telefon (ixtiyoriy)')}

        <div className="border-t border-slate-200 pt-3">
          <p className="mb-2 text-xs font-semibold text-slate-600">Kafe egasi hisobi</p>
          <div className="space-y-3">
            {field('owner_full_name', "To'liq ism")}
            {field('owner_login', 'Login')}
            {field('owner_password', 'Parol (kamida 6 belgi)', 'password')}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Tarif</span>
          <select
            value={form.plan}
            onChange={(e) => setForm({ ...form, plan: e.target.value as SubscriptionPlan })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {PLAN_LABELS[p]}
              </option>
            ))}
          </select>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {mutation.isPending ? 'Yaratilmoqda...' : 'Yaratish'}
        </button>
      </div>
    </ModalShell>
  );
}
