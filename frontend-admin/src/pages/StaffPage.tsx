import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createStaff,
  deleteStaff,
  getStaffPermissions,
  listStaff,
  updateStaff,
  updateStaffPermissions,
} from '../api/endpoints';
import type { PermissionKey, PermissionMap, Staff } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useTranslation } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/dictionaries';
import ModalShell from '../components/ModalShell';

export default function StaffPage() {
  const { t } = useTranslation();
  const { auth, can } = useAuth();
  const canManage = can('staff.manage');
  const queryClient = useQueryClient();
  const { data: staff = [] } = useQuery({ queryKey: ['staff'], queryFn: listStaff });

  const [form, setForm] = useState({ full_name: '', login: '', password: '', role: 'cashier' });
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Staff | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['staff'] });

  const mutation = useMutation({
    mutationFn: () => createStaff(form),
    onSuccess: () => {
      setForm({ full_name: '', login: '', password: '', role: 'cashier' });
      refresh();
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? t('app.error')),
  });

  const blockMutation = useMutation({
    mutationFn: (id: string) => deleteStaff(id),
    onSuccess: refresh,
    onError: (err: any) => setError(err?.response?.data?.error ?? t('app.error')),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => updateStaff(id, { is_active: true }),
    onSuccess: refresh,
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

      {error && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-2">
          {staff.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {s.full_name || s.login}
                </p>
                <p className="text-xs text-slate-400">@{s.login}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {t(`staff.role.${s.role}` as TranslationKey) ?? s.role}
                </span>
                {!s.is_active && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                    {t('staff.blocked')}
                  </span>
                )}

                {/* Kafe egasi va o'zini tahrirlash cheklangan — backend ham
                    aynan shu ikkalasini rad etadi (staff.go). */}
                {canManage && s.role !== 'owner' && (
                  <button
                    onClick={() => {
                      setError(null);
                      setEditing(s);
                    }}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    {t('app.edit')}
                  </button>
                )}

                {canManage && s.role !== 'owner' && s.id !== auth?.user_id && (
                  s.is_active ? (
                    <button
                      onClick={() => {
                        if (confirm(t('staff.deleteConfirm'))) blockMutation.mutate(s.id);
                      }}
                      className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      {t('staff.block')}
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (confirm(t('staff.restoreConfirm'))) restoreMutation.mutate(s.id);
                      }}
                      className="rounded-lg border border-emerald-200 px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                    >
                      {t('staff.restore')}
                    </button>
                  )
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

      {editing && (
        <StaffEditModal
          staff={editing}
          isSelf={editing.id === auth?.user_id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

/**
 * Xodim kartochkasi: asosiy ma'lumot + vakolatlar paneli bitta oynada.
 *
 * Ikkalasi alohida so'rov bilan saqlanadi (PATCH /staff/:id va
 * PUT /staff/:id/permissions), lekin foydalanuvchi uchun bitta "Saqlash"
 * tugmasi bo'lgani qulayroq — shuning uchun ketma-ket yuboriladi.
 */
function StaffEditModal({
  staff,
  isSelf,
  onClose,
  onSaved,
}: {
  staff: Staff;
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();

  const [form, setForm] = useState({
    full_name: staff.full_name,
    login: staff.login,
    role: staff.role,
    is_active: staff.is_active,
    password: '',
  });
  const [overrides, setOverrides] = useState<PermissionMap>({});
  const [error, setError] = useState<string | null>(null);

  const { data: perms } = useQuery({
    queryKey: ['staff-permissions', staff.id],
    queryFn: () => getStaffPermissions(staff.id),
  });

  // Serverdan kelgan shaxsiy o'zgartirishlar formaga bir marta ko'chiriladi.
  useEffect(() => {
    if (perms) setOverrides(perms.overrides ?? {});
  }, [perms]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await updateStaff(staff.id, {
        full_name: form.full_name,
        login: form.login,
        // Rol va faollikni o'zgartirish o'ziga nisbatan taqiqlangan —
        // backend ham rad etadi, shuning uchun umuman yubormaymiz.
        ...(isSelf ? {} : { role: form.role, is_active: form.is_active }),
        ...(form.password ? { password: form.password } : {}),
      });
      await updateStaffPermissions(staff.id, overrides);
    },
    onSuccess: onSaved,
    onError: (err: any) => setError(err?.response?.data?.error ?? t('app.error')),
  });

  // Uch holatli tugma: rol standarti / ruxsat / taqiq.
  function setPermission(key: PermissionKey, value: boolean | null) {
    setOverrides((current) => {
      const next = { ...current };
      if (value === null) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  return (
    <ModalShell
      title={t('staff.edit')}
      subtitle={staff.full_name || staff.login}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            {t('app.cancel')}
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !form.login.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saveMutation.isPending ? t('app.saving') : t('app.save')}
          </button>
        </div>
      }
    >
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              {t('staff.fullName')}
            </span>
            <input
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              {t('staff.login')}
            </span>
            <input
              value={form.login}
              onChange={(e) => setForm((f) => ({ ...f, login: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">{t('staff.role')}</span>
            <select
              value={form.role}
              disabled={isSelf}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="cashier">{t('staff.role.cashier')}</option>
              <option value="waiter">{t('staff.role.waiter')}</option>
              <option value="admin">{t('staff.role.admin')}</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              {t('staff.newPassword')}
            </span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        {!isSelf && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            {form.is_active ? t('staff.activeLabel') : t('staff.blocked')}
          </label>
        )}

        <div className="border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold text-slate-700">{t('staff.permissions')}</h3>
          <p className="mb-3 mt-1 text-xs text-slate-500">{t('staff.permHint')}</p>

          <div className="space-y-1.5">
            {(perms?.all ?? []).map((key) => {
              const fromRole = perms?.defaults?.[key] === true;
              const override = overrides[key];
              const current: 'default' | 'allow' | 'deny' =
                override === undefined ? 'default' : override ? 'allow' : 'deny';

              return (
                <div
                  key={key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-700">
                    {t(`perm.${key}` as TranslationKey) ?? key}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    <PermButton
                      active={current === 'default'}
                      tone="slate"
                      label={`${t('staff.permDefault')} ${fromRole ? '✓' : '✕'}`}
                      onClick={() => setPermission(key, null)}
                    />
                    <PermButton
                      active={current === 'allow'}
                      tone="emerald"
                      label={t('staff.permAllow')}
                      onClick={() => setPermission(key, true)}
                    />
                    <PermButton
                      active={current === 'deny'}
                      tone="red"
                      label={t('staff.permDeny')}
                      onClick={() => setPermission(key, false)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </ModalShell>
  );
}

const TONE_ACTIVE: Record<string, string> = {
  slate: 'bg-slate-700 text-white',
  emerald: 'bg-emerald-600 text-white',
  red: 'bg-red-600 text-white',
};

function PermButton({
  active,
  tone,
  label,
  onClick,
}: {
  active: boolean;
  tone: 'slate' | 'emerald' | 'red';
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
        active ? TONE_ACTIVE[tone] : 'bg-white text-slate-500 hover:bg-slate-100'
      }`}
    >
      {label}
    </button>
  );
}
