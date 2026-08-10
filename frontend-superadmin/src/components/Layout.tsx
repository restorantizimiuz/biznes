import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

// Super-admin panelida bitta bo'lim bor (kafelar), shuning uchun chap menyu
// o'rniga oddiy yuqori panel yetarli.
export default function Layout() {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-800 bg-slate-900 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Cafe System — Platforma paneli</p>
            <p className="text-xs text-slate-400">Barcha kafelarni boshqarish</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-300 sm:inline">{auth?.full_name}</span>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              Chiqish
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  );
}
