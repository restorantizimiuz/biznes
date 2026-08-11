import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listBusinesses, listPlatformStaff, listPlatformUsers } from '../api/endpoints';
import { ROLE_LABELS } from '../api/types';
import StatusBadge from '../components/StatusBadge';

const PAGE_SIZE = 20;

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : '—';
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="divide-y divide-slate-100">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <div className="h-9 w-9 animate-pulse rounded-full bg-slate-100" />
            <div className="h-3 max-w-xs flex-1 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Foydalanuvchilar va Xodimlar sahifalari bir xil jadval — faqat backend
// endpointi (va shu bilan standart rol filtri) farq qiladi: /platform/users
// hammasini, /platform/staff kassir/ofitsiantni qaytaradi.
export default function UsersPage({ mode }: { mode: 'all' | 'staff' }) {
  const [businessId, setBusinessId] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState<'' | 'active' | 'inactive'>('');
  const [offset, setOffset] = useState(0);

  const { data: businesses = [] } = useQuery({
    queryKey: ['platform-businesses'],
    queryFn: listBusinesses,
  });

  const params = {
    business_id: businessId || undefined,
    role: role || undefined,
    status: status || undefined,
    limit: PAGE_SIZE,
    offset,
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [mode === 'all' ? 'platform-users' : 'platform-staff', params],
    queryFn: () => (mode === 'all' ? listPlatformUsers(params) : listPlatformStaff(params)),
  });

  const users = data?.users ?? [];
  const roleOptions = mode === 'all' ? ['owner', 'admin', 'cashier', 'waiter'] : ['cashier', 'waiter'];

  function resetAndSet<T>(setter: (v: T) => void, value: T) {
    setter(value);
    setOffset(0);
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">
          {mode === 'all' ? 'Foydalanuvchilar' : 'Xodimlar'}
        </h1>
        <p className="text-sm text-slate-500">
          {mode === 'all'
            ? 'Platformadagi barcha kafelar bo\'yicha foydalanuvchilar'
            : "Barcha kafelar bo'yicha kassir va ofitsiantlar"}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Kafe</span>
          <select
            value={businessId}
            onChange={(e) => resetAndSet(setBusinessId, e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">Barcha kafelar</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Rol</span>
          <select
            value={role}
            onChange={(e) => resetAndSet(setRole, e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">Barcha rollar</option>
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r] ?? r}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Holat</span>
          <select
            value={status}
            onChange={(e) => resetAndSet(setStatus, e.target.value as typeof status)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">Barchasi</option>
            <option value="active">Faol</option>
            <option value="inactive">Bloklangan</option>
          </select>
        </label>
      </div>

      {isLoading && <TableSkeleton />}

      {isError && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm text-red-700">Ma'lumotni yuklab bo'lmadi.</p>
          <button
            onClick={() => refetch()}
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Qayta urinish
          </button>
        </div>
      )}

      {!isLoading && !isError && (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Foydalanuvchi</th>
                  <th className="px-3 py-2.5 font-medium">Kafe</th>
                  <th className="px-3 py-2.5 font-medium">Rol</th>
                  <th className="px-3 py-2.5 font-medium">Holat</th>
                  <th className="px-3 py-2.5 font-medium">Ro'yxatga olindi</th>
                  <th className="px-3 py-2.5 font-medium">Oxirgi faollik</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="transition hover:bg-slate-50/60">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                          {u.full_name.slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{u.full_name}</p>
                          <p className="truncate text-xs text-slate-400">@{u.login}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{u.business_name}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {ROLE_LABELS[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge active={u.is_active} />
                    </td>
                    <td className="px-3 py-3 text-slate-500">{formatDate(u.created_at)}</td>
                    <td className="px-3 py-3 text-slate-500">{formatDate(u.last_activity_at)}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-400">
                      Hech narsa topilmadi
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              {offset + 1}–{offset + users.length} ko'rsatilmoqda
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                disabled={offset === 0}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                ← Oldingi
              </button>
              <button
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                disabled={users.length < PAGE_SIZE}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Keyingi →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
