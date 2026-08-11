import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listBusinesses, setFeature } from '../api/endpoints';
import { FEATURE_KEYS, FEATURE_LABELS } from '../api/types';

export default function FeatureFlagsPage() {
  const queryClient = useQueryClient();
  const { data: businesses = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['platform-businesses'],
    queryFn: listBusinesses,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, key, enabled }: { id: string; key: string; enabled: boolean }) =>
      setFeature(id, key, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-businesses'] }),
  });

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">Feature Flags</h1>
        <p className="text-sm text-slate-500">
          Har bir kafe uchun qaysi funksiyalar yoqilganini boshqaring
        </p>
      </div>

      {isLoading && (
        <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
      )}

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
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2.5 font-medium">Kafe</th>
                {FEATURE_KEYS.map((key) => (
                  <th key={key} className="px-3 py-2.5 text-center font-medium">
                    {FEATURE_LABELS[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {businesses.map((b) => (
                <tr key={b.id} className="transition hover:bg-slate-50/60">
                  <td className="px-3 py-3 font-medium text-slate-900">{b.name}</td>
                  {FEATURE_KEYS.map((key) => {
                    const enabled = b.features[key] ?? true;
                    const pending =
                      toggleMutation.isPending &&
                      toggleMutation.variables?.id === b.id &&
                      toggleMutation.variables?.key === key;
                    return (
                      <td key={key} className="px-3 py-3 text-center">
                        <button
                          role="switch"
                          aria-checked={enabled}
                          aria-label={`${b.name} — ${FEATURE_LABELS[key]}`}
                          disabled={pending}
                          onClick={() =>
                            toggleMutation.mutate({ id: b.id, key, enabled: !enabled })
                          }
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-50 ${
                            enabled ? 'bg-indigo-600' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                              enabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {businesses.length === 0 && (
                <tr>
                  <td colSpan={FEATURE_KEYS.length + 1} className="px-3 py-10 text-center text-sm text-slate-400">
                    Hali kafe qo'shilmagan
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
