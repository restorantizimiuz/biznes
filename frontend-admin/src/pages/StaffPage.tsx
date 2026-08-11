import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createStaff, deleteStaff, listStaff } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { useTranslation } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/dictionaries';

export default function StaffPage() {
  const { t } = useTranslation();
  const { auth } = useAuth();
  const canManage = auth?.role === 'owner' || auth?.role === 'admin';
  const queryClient = useQueryClient();
  const { data: staff = [] } = useQuery({ queryKey: ['staff'], queryFn: listStaff });

  const [form, setForm] = useState({ full_name: '', login: '', password: '', role: 'cashier' });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => createStaff(form),
    onSuccess: () => {
      setForm({ full_name: '', login: '', password: '', role: 'cashier' });
      queryClient.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? t('app.error')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteStaff(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }),
    onError: (err: any) => setError(err?.response?.data?.error ?? t('app.error')),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.login.trim() && form.password.trim()) mutation.mutate();
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-slate-900">{t('staff.title')}</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-2">
          {staff.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div>
                <p className="text-sm font-medium text-slate-900">{s.full_name || s.login}</p>
                <p className="text-xs text-slate-400">@{s.login}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {t(`staff.role.${s.role}` as TranslationKey) ?? s.role}
                </span>
                {!s.is_active && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                    {t('staff.blocked')}
                  </span>
                )}
                {canManage && s.is_active && s.role !== 'owner' && s.id !== auth?.user_id && (
                  <button
                    onClick={() => {
                      if (confirm(t('staff.deleteConfirm'))) deleteMutation.mutate(s.id);
                    }}
                    className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    {t('app.delete')}
                  </button>
                )}
              </div>
            </div>
          ))}
          {staff.length === 0 && (
            <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
              {t('staff.noStaff')}
            </p>
          )}
        </div>

        {canManage && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('staff.newStaff')}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder={t('staff.fullName')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                value={form.login}
                onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
                placeholder={t('staff.login')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder={t('staff.password')}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="cashier">{t('staff.role.cashier')}</option>
                <option value="waiter">{t('staff.role.waiter')}</option>
                <option value="admin">{t('staff.role.admin')}</option>
              </select>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={mutation.isPending}
                className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {mutation.isPending ? t('app.saving') : t('app.add')}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
