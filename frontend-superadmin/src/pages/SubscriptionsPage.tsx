import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listBusinesses } from '../api/endpoints';
import { PLAN_LABELS } from '../api/types';
import BusinessDetailModal from '../components/BusinessDetailModal';

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Faol',
  expired: 'Tugagan',
  suspended: "To'xtatilgan",
};

const STATUS_TONE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-red-100 text-red-700',
  suspended: 'bg-amber-100 text-amber-700',
};

export default function SubscriptionsPage() {
  const queryClient = useQueryClient();
  const { data: businesses = [], isLoading } = useQuery({
    queryKey: ['platform-businesses'],
    queryFn: listBusinesses,
  });
  const [openBusinessId, setOpenBusinessId] = useState<string | null>(null);
  const openBusiness = businesses.find((b) => b.id === openBusinessId) ?? null;

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['platform-businesses'] });
    queryClient.invalidateQueries({ queryKey: ['platform-stats'] });
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">Obunalar</h1>
        <p className="text-sm text-slate-500">Har bir kafening obuna tarifi va muddati</p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          ))}
        </div>
      )}

      {!isLoading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {businesses.map((b) => {
            const status = b.subscription_status ?? 'expired';
            return (
              <button
                key={b.id}
                onClick={() => setOpenBusinessId(b.id)}
                className="flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="mb-2 flex w-full items-center justify-between gap-2">
                  <span className="truncate font-medium text-slate-900">{b.name}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[status] ?? 'bg-slate-100 text-slate-600'}`}
                  >
                    {STATUS_LABELS[status] ?? status}
                  </span>
                </div>
                <p className="text-lg font-semibold text-indigo-600">
                  {b.subscription_plan ? PLAN_LABELS[b.subscription_plan] : "Obuna yo'q"}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {formatDate(b.subscription_ends_at)} gacha amal qiladi
                </p>
              </button>
            );
          })}
          {businesses.length === 0 && (
            <p className="col-span-full rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
              Hali kafe qo'shilmagan
            </p>
          )}
        </div>
      )}

      {openBusiness && (
        <BusinessDetailModal
          business={openBusiness}
          onClose={() => setOpenBusinessId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
