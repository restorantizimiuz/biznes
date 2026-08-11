import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { setFeature, setSubscription, updateBusiness } from '../api/endpoints';
import { FEATURE_KEYS, FEATURE_LABELS, PLAN_LABELS, type Business, type SubscriptionPlan } from '../api/types';
import ModalShell from './ModalShell';

const PLANS: SubscriptionPlan[] = ['basic', 'qr', 'full'];

export default function BusinessDetailModal({
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
          <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-700">{message}</p>
        )}

        <section className="space-y-3 rounded-xl border border-slate-200 p-3">
          <h3 className="text-sm font-semibold text-slate-800">Kafe va limitlar</h3>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Nomi</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
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
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            Saqlash
          </button>
        </section>

        <section className="space-y-2 rounded-xl border border-slate-200 p-3">
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
                  className="h-4 w-4 accent-indigo-600"
                />
                {FEATURE_LABELS[key]}
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-slate-200 p-3">
          <h3 className="text-sm font-semibold text-slate-800">Obuna</h3>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Tarif</span>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as SubscriptionPlan)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
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
                className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <button
              onClick={() => subscriptionMutation.mutate()}
              disabled={subscriptionMutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              Belgilash
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-red-200 bg-red-50/50 p-3">
          <h3 className="mb-1 text-sm font-semibold text-red-700">Kafeni to'xtatish</h3>
          <p className="mb-2 text-xs text-red-600">
            To'xtatilgan kafe xodimlari tizimga kira olmaydi. Ma'lumotlar o'chirilmaydi.
          </p>
          <button
            onClick={() => toggleActiveMutation.mutate()}
            disabled={toggleActiveMutation.isPending}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:opacity-60 ${
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
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      />
    </label>
  );
}
