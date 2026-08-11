import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { platformLogin } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';

/**
 * Super-admin logini.
 *
 * Kafe xodimlarining hisoblari bu yerda umuman ishlamaydi: backendda alohida
 * jadval (platform_admins) va alohida JWT kalit ishlatiladi. Shuning uchun
 * "server/kafe kodi" maydoni ham yo'q — platforma bitta.
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      setAuth(await platformLogin(login.trim(), password));
      navigate('/');
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Kirishda xatolik yuz berdi');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_20px_40px_-16px_rgba(79,70,229,0.35)] sm:p-8"
      >
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-2xl shadow-sm">
            ☕
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Platforma paneli</h1>
          <p className="text-xs text-slate-500">Cafe System — super-admin</p>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Login</span>
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoFocus
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Parol</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
        >
          {submitting ? 'Kirilmoqda...' : 'Kirish'}
        </button>
      </form>
    </div>
  );
}
