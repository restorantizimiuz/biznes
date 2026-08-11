import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
  const { setAuth } = useAuth();
  const navigate = useNavigate();
  const [businessCode, setBusinessCode] = useState('demo-cafe');
  const [loginValue, setLoginValue] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await login(businessCode, loginValue, password);
      setAuth(data);
      navigate('/');
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Kirishda xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(79,70,229,0.18)] sm:p-8"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-2xl shadow-sm">
            🍽️
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Cafe System</h1>
          <p className="mt-1 text-sm text-slate-500">Kassa / Admin panelga kirish</p>
        </div>

        <label className="mb-1 block text-sm font-medium text-slate-700">Server (business code)</label>
        <input
          className="mb-4 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          value={businessCode}
          onChange={(e) => setBusinessCode(e.target.value)}
          required
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">Login</label>
        <input
          className="mb-4 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          value={loginValue}
          onChange={(e) => setLoginValue(e.target.value)}
          required
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">Parol</label>
        <input
          type="password"
          className="mb-6 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && (
          <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading ? 'Kirilmoqda...' : 'Kirish'}
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">
          Demo: demo-cafe / admin / demo1234
        </p>
      </form>
    </div>
  );
}
