import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { navItemsForRole } from './Layout';

/**
 * Login va rol tekshiruvi.
 *
 * Menyudan bo'limni yashirish yetarli emas: foydalanuvchi URL'ni qo'lda
 * yozib ham kirishga urinishi mumkin. Shu yerda joriy yo'l roliga mos
 * kelmasa, uning uchun ochiq birinchi sahifaga yo'naltiriladi.
 *
 * (Bu ham faqat qulaylik qatlami — ma'lumotni haqiqatda backend himoyalaydi.)
 */
export default function ProtectedRoute() {
  const { auth } = useAuth();
  const location = useLocation();

  if (!auth) return <Navigate to="/login" replace />;

  const allowed = navItemsForRole(auth.role);
  const current = allowed.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  );

  if (!current) {
    // Rolga ochiq birinchi bo'lim. Hech biri ochiq bo'lmasa (kutilmagan rol) —
    // login sahifasiga qaytariladi, chunki ko'rsatadigan narsa yo'q.
    const fallback = allowed[0];
    if (!fallback) return <Navigate to="/login" replace />;
    return <Navigate to={fallback.to} replace />;
  }

  return <Outlet />;
}
