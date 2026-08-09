import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings } from '../api/endpoints';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const [language, setLanguage] = useState('');

  const mutation = useMutation({
    mutationFn: () => updateSettings({ language }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });

  if (!settings) return <p className="text-sm text-slate-500">Yuklanmoqda...</p>;

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Sozlamalar</h1>

      <div className="max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs text-slate-500">Kafe nomi</p>
          <p className="text-sm font-medium text-slate-900">{settings.name}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Obuna turi</p>
          <p className="text-sm font-medium text-slate-900">
            {settings.subscription_plan} ({settings.subscription_status})
          </p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Til</label>
          <select
            value={language || settings.language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="uz">O'zbek</option>
            <option value="ru">Русский</option>
            <option value="en">English</option>
          </select>
        </div>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {mutation.isPending ? 'Saqlanmoqda...' : 'Saqlash'}
        </button>
      </div>
    </div>
  );
}
