import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listBusinesses, listPlatformAuditLogs } from '../api/endpoints';
import { AUDIT_ACTION_LABELS } from '../api/types';

const PAGE_SIZE = 30;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString();
}

function describeDetails(details: Record<string, unknown> | null): string {
  if (!details) return '';
  return Object.entries(details)
    .filter(([, value]) => value !== null && value !== '' && value !== undefined)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
    .join(' · ');
}

export default function AuditLogPage() {
  const [businessId, setBusinessId] = useState('');
  const [action, setAction] = useState('');
  const [offset, setOffset] = useState(0);

  const { data: businesses = [] } = useQuery({
    queryKey: ['platform-businesses'],
    queryFn: listBusinesses,
  });

  const params = {
    business_id: businessId || undefined,
    action: action || undefined,
    limit: PAGE_SIZE,
    offset,
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['platform-audit', params],
    queryFn: () => listPlatformAuditLogs(params),
  });

  const entries = data?.entries ?? [];

  function resetAndSet<T>(setter: (v: T) => void, value: T) {
    setter(value);
    setOffset(0);
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">Audit jurnali</h1>
        <p className="text-sm text-slate-500">Barcha kafelar bo'yicha amallar tarixi</p>
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
          <span className="mb-1 block text-xs font-medium text-slate-600">Amal</span>
          <select
            value={action}
            onChange={(e) => resetAndSet(setAction, e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">Barcha amallar</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm text-red-700">Jurnalni yuklab bo'lmadi.</p>
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
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <ul className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
                  <span className="w-40 shrink-0 text-xs text-slate-400">
                    {formatDateTime(entry.created_at)}
                  </span>
                  <span className="w-36 shrink-0 truncate text-xs font-medium text-indigo-600">
                    {entry.business_name}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-slate-800">{entry.actor || '—'}</span>{' '}
                    <span className="text-slate-600">
                      {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                    </span>
                    {entry.details && (
                      <span className="block text-xs text-slate-400">
                        {describeDetails(entry.details)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
              {entries.length === 0 && (
                <li className="px-4 py-10 text-center text-sm text-slate-400">
                  Hech qanday yozuv topilmadi
                </li>
              )}
            </ul>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              {offset + 1}–{offset + entries.length} ko'rsatilmoqda
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
                disabled={entries.length < PAGE_SIZE}
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
