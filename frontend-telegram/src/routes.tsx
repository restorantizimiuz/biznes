import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import App from './App';
import WebMenu from './pages/WebMenu';
import OrderTracking from './pages/OrderTracking';
import { useTelegramChrome } from './hooks/useTelegramChrome';

/**
 * MIJOZ ILOVASINING IKKI REJIMI
 *
 * Bitta ilova, ikki xil kirish nuqtasi — komponentlar (menyu, savat,
 * mahsulot kartochkasi) ikkalasida ham umumiy, shuning uchun takrorlanmaydi:
 *
 *   /?table=<token>   → TELEGRAM, stol rejimi. Mijoz stolda o'tiribdi, bot
 *                       WebApp'ni shu havola bilan ochadi. Faqat menyu va
 *                       stolning joriy hisobi kerak.
 *
 *   /menyu/<kod>      → OCHIQ VEB SAHIFA. Kafe buni Instagram profiliga
 *                       qo'yadi. Mijoz uyda menyuni ko'radi, manzil va
 *                       to'lov usulini kiritib buyurtma beradi.
 *
 *   /buyurtma/<token> → Veb buyurtmaning holatini kuzatish.
 *
 * Stol rejimi eski `?table=` shaklida qoldirildi (yo'lga ko'chirilmadi):
 * bot allaqachon shunday havola yuboradi va chop etilgan QR kodlar ham
 * mavjud — ularni buzib bo'lmaydi.
 */
export default function AppRoutes() {
  // Marshrut darajasida — App.tsx, WebMenu.tsx, OrderTracking.tsx
  // qaysi biri render bo'lishidan qat'iy nazar bitta marta ishlaydi.
  useTelegramChrome();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/menyu/:businessCode" element={<WebMenu />} />
        <Route path="/buyurtma/:token" element={<OrderTracking />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
