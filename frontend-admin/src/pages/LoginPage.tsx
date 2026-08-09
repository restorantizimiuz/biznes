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
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="mb-1 text-xl font-semibold text-slate-900">Cafe System</h1>
        <p className="mb-6 text-sm text-slate-500">Kassa / Admin panelga kirish</p>

        <label className="mb-1 block text-sm font-medium text-slate-700">Server (business code)</label>
        <input
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          value={businessCode}
          onChange={(e) => setBusinessCode(e.target.value)}
          required
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">Login</label>
        <input
          className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          value={loginValue}
          onChange={(e) => setLoginValue(e.target.value)}
          required
        />

        <label className="mb-1 block text-sm font-medium text-slate-700">Parol</label>
        <input
          type="password"
          className="mb-6 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
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
