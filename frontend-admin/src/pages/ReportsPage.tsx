import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import apiClient from '../api/client';
import { getDailySummary } from '../api/endpoints';
import type { DailySummary } from '../api/types';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [summary, setSummary] = useState<DailySummary | null>(null);

  const summaryMutation = useMutation({
    mutationFn: () => getDailySummary(from, to),
    onSuccess: (data) => setSummary(data),
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.get('/reports/export', {
        params: { from, to },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `hisobot_${from}_${to}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
    },
  });

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Kunlik hisobot</h1>

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Dan</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Gacha</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={() => summaryMutation.mutate()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Hisobotni ko'rish
        </button>
        <button
          onClick={() => exportMutation.mutate()}
          disabled={exportMutation.isPending}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          {exportMutation.isPending ? 'Yuklanmoqda...' : 'Excel eksport'}
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Jami buyurtma" value={summary.total_orders} />
          <StatCard label="Onlayn buyurtma" value={summary.online_orders} />
          <StatCard label="Jami tushum" value={`${summary.total_revenue.toLocaleString()} so'm`} />
          <StatCard label="Naqd" value={`${summary.cash_total.toLocaleString()} so'm`} />
          <StatCard label="Karta / o'tkazma" value={`${(summary.card_total + summary.transfer_total).toLocaleString()} so'm`} />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
