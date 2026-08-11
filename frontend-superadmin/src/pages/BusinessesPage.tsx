import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { listBusinesses } from '../api/endpoints';
import { PLAN_LABELS } from '../api/types';
import BusinessDetailModal from '../components/BusinessDetailModal';
import CreateBusinessModal from '../components/CreateBusinessModal';
import StatusBadge from '../components/StatusBadge';

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="divide-y divide-slate-100">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <div className="h-9 w-9 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-3 flex-1 max-w-xs animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-16 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BusinessesPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    data: businesses = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['platform-businesses'],
    queryFn: listBusinesses,
  });

  const [openBusinessId, setOpenBusinessId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Boshqaruv panelidagi "Yangi kafe qo'shish" tezkor amali shu yerga
  // ?create=1 bilan yo'naltiradi — oyna avtomatik ochiladi.
  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setCreating(true);
      searchParams.delete('create');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const openBusiness = businesses.find((b) => b.id === openBusinessId) ?? null;

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['platform-businesses'] });
    queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">Faol kafelar</h1>
          <p className="text-sm text-slate-500">Platformadagi barcha kafelar ro'yxati</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700"
        >
          + Yangi kafe
        </button>
      </div>

      {isLoading && <TableSkeleton />}

      {isError && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm text-red-700">Kafelar ro'yxatini yuklab bo'lmadi.</p>
          <button
            onClick={() => refetch()}
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Qayta urinish
          </button>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Kafe</th>
                <th className="px-3 py-2.5 font-medium">Kod</th>
                <th className="px-3 py-2.5 font-medium">Obuna</th>
                <th className="px-3 py-2.5 font-medium">Stollar</th>
                <th className="px-3 py-2.5 font-medium">Ofitsiant</th>
                <th className="px-3 py-2.5 font-medium">Kassir</th>
                <th className="px-3 py-2.5 font-medium">Oxirgi faollik</th>
                <th className="px-3 py-2.5 font-medium">Holat</th>
                <th className="px-3 py-2.5 font-medium">Amallar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {businesses.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => setOpenBusinessId(b.id)}
                  className="cursor-pointer transition hover:bg-indigo-50/40"
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm">
                        ☕
                      </span>
                      <span className="font-medium text-slate-900">{b.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                      {b.business_code}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {b.subscription_plan ? PLAN_LABELS[b.subscription_plan] : '—'}
                    <span className="block text-xs text-slate-400">
                      {formatDate(b.subscription_ends_at)} gacha
                    </span>
                  </td>
                  {/* Limitga yaqinlashgan qiymatlar ajratib ko'rsatiladi */}
                  <LimitCell used={b.table_count} limit={b.max_tables} />
                  <LimitCell used={b.waiter_count} limit={b.max_waiters} />
                  <LimitCell used={b.cashier_count} limit={b.max_cashiers} />
                  <td className="px-3 py-3 text-slate-500">{formatDate(b.last_activity_at)}</td>
                  <td className="px-3 py-3">
                    <StatusBadge active={b.is_active} />
                  </td>
                  <td className="px-3 py-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenBusinessId(b.id);
                      }}
                      aria-label={`${b.name} — amallar`}
                      className="rounded-lg px-2 py-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    >
                      ⋯
                    </button>
                  </td>
                </tr>
              ))}
              {businesses.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-400">
                    Hali kafe qo'shilmagan
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

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

function LimitCell({ used, limit }: { used: number; limit: number }) {
  const full = used >= limit;
  return (
    <td className={`px-3 py-3 ${full ? 'font-semibold text-amber-700' : 'text-slate-600'}`}>
      {used} / {limit}
    </td>
  );
}
