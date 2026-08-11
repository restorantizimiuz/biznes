import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getStats, listBusinesses } from '../api/endpoints';
import StatCard from '../components/StatCard';

const QUICK_ACTIONS = [
  {
    icon: '☕',
    title: 'Yangi kafe qoʻshish',
    description: "Kafe, egasining hisobi va obunani birga yarating",
    to: '/kafelar?create=1',
  },
  {
    icon: '👥',
    title: 'Foydalanuvchilar',
    description: "Platformadagi barcha foydalanuvchilarni ko'ring",
    to: '/foydalanuvchilar',
  },
  {
    icon: '💳',
    title: 'Obunalar',
    description: "Kafelar obunasini boshqaring",
    to: '/obunalar',
  },
  {
    icon: '📋',
    title: 'Audit jurnali',
    description: "Platformadagi amallar tarixini ko'ring",
    to: '/audit',
  },
];

function StatCardsSkeleton() {
  return (
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-[92px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100"
        />
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery({
    queryKey: ['platform-stats'],
    queryFn: getStats,
  });
  const { data: businesses = [] } = useQuery({
    queryKey: ['platform-businesses'],
    queryFn: listBusinesses,
  });

  const activeSubscriptions = businesses.filter((b) => b.subscription_status === 'active').length;

  return (
    <div>
      {/* Sarlavha va tavsif yuqoridagi umumiy header'da ko'rsatiladi (Layout.tsx) */}
      {statsLoading && <StatCardsSkeleton />}

      {statsError && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Statistikani yuklab bo'lmadi. Sahifani yangilab ko'ring.
        </div>
      )}

      {stats && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard icon="☕" label="Kafelar" value={stats.total_businesses} hint="Jami kafelar" />
          <StatCard
            icon="✅"
            label="Faol kafelar"
            value={stats.active_businesses}
            hint="Hozir faol"
          />
          <StatCard icon="👥" label="Xodimlar" value={stats.total_users} hint="Barcha xodimlar" />
          <StatCard
            icon="🧾"
            label="Bugungi buyurtma"
            value={stats.orders_today}
            hint="Bugun qabul qilingan"
          />
          <StatCard
            icon="💰"
            label="Bugungi tushum"
            value={`${stats.revenue_today.toLocaleString()} so'm`}
            hint="Bugungi umumiy tushum"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Platforma haqida</h2>
          <div className="space-y-3">
            <InfoRow icon="🏷️" label="Platforma versiyasi" value="v1.0" />
            <InfoRow icon="☕" label="Umumiy kafelar" value={String(stats?.total_businesses ?? '—')} />
            <InfoRow icon="👥" label="Umumiy foydalanuvchilar" value={String(stats?.total_users ?? '—')} />
            <InfoRow icon="💳" label="Faol obunalar" value={String(activeSubscriptions)} />
            <InfoRow
              icon="💰"
              label="Jami tushum (bugun)"
              value={stats ? `${stats.revenue_today.toLocaleString()} so'm` : '—'}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Tezkor amallar</h2>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.to}
                onClick={() => navigate(action.to)}
                className="flex cursor-pointer flex-col items-start gap-1.5 rounded-xl border border-slate-200 p-3.5 text-left transition hover:border-indigo-200 hover:bg-indigo-50/50"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-base">
                  {action.icon}
                </span>
                <p className="text-sm font-semibold text-slate-800">{action.title}</p>
                <p className="text-xs text-slate-400">{action.description}</p>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
      <span className="flex items-center gap-2 text-sm text-slate-600">
        <span aria-hidden>{icon}</span>
        {label}
      </span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}
