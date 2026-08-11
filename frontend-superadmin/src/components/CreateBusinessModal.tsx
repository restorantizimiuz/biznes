import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createBusiness } from '../api/endpoints';
import { PLAN_LABELS, type CreateBusinessBody, type SubscriptionPlan } from '../api/types';
import ModalShell from './ModalShell';

const PLANS: SubscriptionPlan[] = ['basic', 'qr', 'full'];

export default function CreateBusinessModal({
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
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
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
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
        >
          {mutation.isPending ? 'Yaratilmoqda...' : 'Yaratish'}
        </button>
      </div>
    </ModalShell>
  );
}
