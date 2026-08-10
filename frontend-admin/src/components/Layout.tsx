import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
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
  roles: UserRole[];
  end?: boolean;
}[] = [
  { to: '/', labelKey: 'nav.orders', roles: ['owner', 'admin', 'cashier'], end: true },
  { to: '/menu', labelKey: 'nav.menu', roles: ['owner', 'admin', 'waiter'] },
  { to: '/tables', labelKey: 'nav.tables', roles: ['owner', 'admin', 'waiter'] },
  { to: '/staff', labelKey: 'nav.staff', roles: ['owner', 'admin'] },
  { to: '/reports', labelKey: 'nav.reports', roles: ['owner', 'admin', 'cashier'] },
  { to: '/settings', labelKey: 'nav.settings', roles: ['owner', 'admin'] },
];

/** Rol uchun ochiq bo'limlar. Login sahifasidan keyingi birinchi sahifa ham shundan olinadi. */
export function navItemsForRole(role: string | undefined) {
  return NAV_ITEMS.filter((item) => item.roles.includes(role as UserRole));
}

export default function Layout() {
  const { auth, logout } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { connected, soundBlocked } = useOrderNotifications();
  const [menuOpen, setMenuOpen] = useState(false);

  const items = navItemsForRole(auth?.role);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const navLinks = (
    <nav className="flex-1 space-y-1 px-3 py-4">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) =>
            `block rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'
            }`
          }
        >
          {t(item.labelKey)}
        </NavLink>
      ))}
    </nav>
  );

  const sidebarFooter = (
    <div className="border-t border-slate-200 p-4">
      <p className="truncate text-sm font-medium text-slate-800">{auth?.full_name}</p>
      <p className="text-xs text-slate-400">
        {t(`staff.role.${auth?.role}` as TranslationKey)}
      </p>
      {/* Real vaqt ulanishi holati: uzilganda kassir ma'lumot biroz kechikishi
          mumkinligini bilib turishi kerak. */}
      <p className={`mt-2 text-[11px] ${connected ? 'text-emerald-600' : 'text-amber-600'}`}>
        {connected ? `● ${t('notify.connected')}` : `○ ${t('notify.disconnected')}`}
      </p>
      <button
        onClick={handleLogout}
        className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
      >
        {t('app.logout')}
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 lg:flex-row">
      {/* Telefon/planshet uchun yuqori panel — chap menyu joy egallamasligi uchun */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <button
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={t('app.title')}
          className="rounded-lg border border-slate-200 px-3 py-2 text-slate-600"
        >
          ☰
        </button>
        <p className="text-sm font-semibold text-slate-900">{t('app.title')}</p>
        <span className={`text-xs ${connected ? 'text-emerald-600' : 'text-amber-600'}`}>●</span>
      </header>

      {menuOpen && (
        <div className="border-b border-slate-200 bg-white lg:hidden">
          {navLinks}
          {sidebarFooter}
        </div>
      )}

      <aside className="hidden w-56 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="border-b border-slate-200 px-5 py-5">
          <p className="text-sm font-semibold text-slate-900">{t('app.title')}</p>
          <p className="text-xs text-slate-400">{t('app.subtitle')}</p>
        </div>
        {navLinks}
        {sidebarFooter}
      </aside>

      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        {soundBlocked && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            🔇 {t('notify.soundBlocked')}
          </p>
        )}
        <Outlet />
      </main>
    </div>
  );
}
