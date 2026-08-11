import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useTranslation } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/dictionaries';
import type { UserRole } from '../api/types';
import { useOrderNotifications } from '../notifications/useOrderNotifications';

// Har bir bo'lim qaysi rollarga ko'rinishi.
//
// MUHIM: bu ro'yxat faqat qulaylik uchun — menyuni yashirish himoya emas.
// Haqiqiy himoya backendda (backend/internal/handlers/routes.go): endpoint
// himoyalanmasa, ofitsiant brauzer konsolidan so'rov yuborib ma'lumotni
// baribir olaverardi. Ikkala tomon bir xil jadvalga amal qiladi.
export const NAV_ITEMS: {
  to: string;
  labelKey: TranslationKey;
  icon: string;
  roles: UserRole[];
  end?: boolean;
}[] = [
  { to: '/', labelKey: 'nav.orders', icon: '🧾', roles: ['owner', 'admin', 'cashier'], end: true },
  { to: '/menu', labelKey: 'nav.menu', icon: '🍽️', roles: ['owner', 'admin', 'waiter'] },
  { to: '/tables', labelKey: 'nav.tables', icon: '🪑', roles: ['owner', 'admin', 'waiter'] },
  { to: '/staff', labelKey: 'nav.staff', icon: '👥', roles: ['owner', 'admin'] },
  { to: '/reports', labelKey: 'nav.reports', icon: '📊', roles: ['owner', 'admin', 'cashier'] },
  { to: '/settings', labelKey: 'nav.settings', icon: '⚙️', roles: ['owner', 'admin'] },
];

/** Rol uchun ochiq bo'limlar. Login sahifasidan keyingi birinchi sahifa ham shundan olinadi. */
export function navItemsForRole(role: string | undefined) {
  return NAV_ITEMS.filter((item) => item.roles.includes(role as UserRole));
}

export default function Layout() {
  const { auth, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { connected, soundBlocked } = useOrderNotifications();
  const [menuOpen, setMenuOpen] = useState(false);

  const items = navItemsForRole(auth?.role);
  const currentItem = items.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  );

  // Sahifa almashganda drawer avtomatik yopiladi (masalan orqaga tugmasi bilan).
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const brandBlock = (
    <div className="flex items-center gap-3 px-5 py-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-lg shadow-sm">
        🍽️
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{t('app.title')}</p>
        <p className="truncate text-xs text-slate-400">{t('app.subtitle')}</p>
      </div>
    </div>
  );

  const navLinks = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              isActive
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span className={`text-base ${isActive ? 'opacity-100' : 'opacity-70'}`}>
                {item.icon}
              </span>
              <span className="truncate">{t(item.labelKey)}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );

  const sidebarFooter = (
    <div className="border-t border-slate-200 p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
          {(auth?.full_name || '?').slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800">{auth?.full_name}</p>
          <p className="truncate text-xs text-slate-400">
            {t(`staff.role.${auth?.role}` as TranslationKey)}
          </p>
        </div>
      </div>
      {/* Real vaqt ulanishi holati: uzilganda kassir ma'lumot biroz kechikishi
          mumkinligini bilib turishi kerak. */}
      <p
        className={`mb-3 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${
          connected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
        }`}
      >
        <span className={connected ? 'text-emerald-500' : 'text-amber-500'}>●</span>
        {connected ? t('notify.connected') : t('notify.disconnected')}
      </p>
      <button
        onClick={handleLogout}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-medium text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
      >
        {t('app.logout')}
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop: doim ko'rinadigan, siljiganda ham joyida qoladigan yon panel */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white">
        {brandBlock}
        {navLinks}
        {sidebarFooter}
      </aside>

      {/* Mobil: orqa fon + ochiladigan panel (drawer) */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
            onClick={() => setMenuOpen(false)}
          />
          <div className="animate-drawer-in absolute inset-y-0 left-0 flex w-72 max-w-[82%] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pr-3">
              {brandBlock}
              <button
                onClick={() => setMenuOpen(false)}
                aria-label={t('app.close')}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
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
              aria-label={t('app.title')}
              className="rounded-lg border border-slate-200 px-2.5 py-2 text-slate-600 hover:bg-slate-50 lg:hidden"
            >
              ☰
            </button>
            <h1 className="truncate text-base font-semibold text-slate-900 sm:text-lg">
              {currentItem ? t(currentItem.labelKey) : t('app.title')}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium sm:flex ${
                connected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}
            >
              <span className={connected ? 'text-emerald-500' : 'text-amber-500'}>●</span>
              {connected ? t('notify.connected') : t('notify.disconnected')}
            </span>
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full text-sm sm:hidden ${
                connected ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
              }`}
              aria-hidden
            >
              ●
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500">
              🔔
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {soundBlocked && (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              🔇 {t('notify.soundBlocked')}
            </p>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
