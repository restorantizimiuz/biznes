import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { navItemsForPermissions } from './Layout';

/**
 * Login va vakolat tekshiruvi.
 *
 * Menyudan bo'limni yashirish yetarli emas: foydalanuvchi URL'ni qo'lda
 * yozib ham kirishga urinishi mumkin. Shu yerda joriy yo'l vakolatiga mos
 * kelmasa, uning uchun ochiq birinchi sahifaga yo'naltiriladi.
 *
 * (Bu ham faqat qulaylik qatlami — ma'lumotni haqiqatda backend himoyalaydi.)
 */
export default function ProtectedRoute() {
  const { auth } = useAuth();
  const location = useLocation();

  if (!auth) return <Navigate to="/login" replace />;

  // Yangilanishdan oldin saqlangan sessiyada vakolatlar yo'q — AuthContext
  // ularni GET /me orqali olib keladi. Shu oraliqda "hech narsaga ruxsat yo'q"
  // deb login sahifasiga uloqtirib yubormaslik kerak, aks holda ishlab turgan
  // xodim sababsiz tizimdan chiqib qolardi.
  if (!auth.permissions || Object.keys(auth.permissions).length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Yuklanmoqda...
      </div>
    );
  }

  const allowed = navItemsForPermissions(auth.permissions);
  const current = allowed.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  );

  if (!current) {
    // Xodimga ochiq birinchi bo'lim. Hech biri ochiq bo'lmasa (admin hamma
    // vakolatni olib qo'ygan) — login sahifasiga qaytariladi, chunki
    // ko'rsatadigan narsa yo'q.
    const fallback = allowed[0];
    if (!fallback) return <Navigate to="/login" replace />;
    return <Navigate to={fallback.to} replace />;
  }

  return <Outlet />;
}
