import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  subtitle?: string;
  /** Platforma darajasida hali backend endpointi yo'q — ComingSoonPage'ga olib boradi. */
  soon?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: 'Boshqaruv paneli',
    icon: '🏠',
    end: true,
    subtitle: 'Platforma umumiy statistikasi va faol kafelar',
  },
  { to: '/kafelar', label: 'Kafelar', icon: '☕' },
  { to: '/foydalanuvchilar', label: 'Foydalanuvchilar', icon: '👥' },
  { to: '/obunalar', label: 'Obunalar', icon: '💳' },
  { to: '/xodimlar', label: 'Xodimlar', icon: '👨‍💼' },
  { to: '/feature-flags', label: 'Feature Flags', icon: '⚑' },
  { to: '/audit', label: 'Audit jurnali', icon: '📋' },
  { to: '/sozlamalar', label: 'Platforma sozlamalari', icon: '⚙️', soon: true },
];

export default function Layout() {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const currentItem = NAV_ITEMS.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  );

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const brandBlock = (
    <div className="flex items-center gap-3 px-5 py-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-lg shadow-sm">
        ☕
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white">Cafe System</p>
        <p className="truncate text-xs text-slate-400">Platforma paneli</p>
      </div>
    </div>
  );

  const navLinks = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              isActive
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`
          }
        >
          <span className="text-base">{item.icon}</span>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.soon && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />}
        </NavLink>
      ))}
    </nav>
  );

  const sidebarFooter = (
    <div className="border-t border-slate-800 p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-sm font-semibold text-indigo-300">
          {(auth?.full_name || '?').slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">
            {auth?.full_name || 'Platforma administratori'}
          </p>
          <p className="truncate text-xs text-slate-400">Superadmin</p>
        </div>
      </div>
      <button
        onClick={handleLogout}
        className="w-full rounded-xl border border-slate-700 px-3 py-2.5 text-xs font-medium text-slate-200 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
      >
        Chiqish
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop: doim ko'rinadigan, dark navy yon panel */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:bg-slate-900">
        {brandBlock}
        {navLinks}
        {sidebarFooter}
      </aside>

      {/* Mobil: orqa fon + ochiladigan panel (drawer) */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]"
            onClick={() => setMenuOpen(false)}
          />
          <div className="animate-drawer-in absolute inset-y-0 left-0 flex w-72 max-w-[82%] flex-col bg-slate-900 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pr-3">
              {brandBlock}
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Menyuni yopish"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                ✕
              </button>
            </div>
            {navLinks}
            {sidebarFooter}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barcha o'lchamlarda ko'rinadigan yuqori panel */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Menyuni ochish"
              className="rounded-lg border border-slate-200 px-2.5 py-2 text-slate-600 hover:bg-slate-50 lg:hidden"
            >
              ☰
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-slate-900 sm:text-lg">
                {currentItem?.label ?? 'Platforma paneli'}
              </h1>
              {currentItem?.subtitle && (
                <p className="hidden truncate text-xs text-slate-400 sm:block">
                  {currentItem.subtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              aria-label="Bildirishnomalar"
              className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50"
            >
              🔔
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-indigo-500" />
            </button>

            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen((open) => !open)}
                aria-haspopup="true"
                aria-expanded={profileOpen}
                className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-2.5 transition hover:bg-slate-50"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                  {(auth?.full_name || '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block text-xs font-medium text-slate-800">
                    {auth?.full_name || 'Platforma administratori'}
                  </span>
                  <span className="block text-[11px] text-slate-400">Superadmin</span>
                </span>
                <span className="text-xs text-slate-400">▾</span>
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  <button
                    onClick={handleLogout}
                    className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    Chiqish
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
