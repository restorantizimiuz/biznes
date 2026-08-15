import { useEffect } from 'react';
import { getTelegramWebApp } from '../telegram';

const tg = getTelegramWebApp();

/**
 * Telegram WebApp'ga "men tayyorman" signali va asosiy ko'rinish sozlamalari.
 *
 * MUHIM — MARSHRUT DARAJASIDA CHAQIRILISHI SHART: Telegram o'zining
 * yuklanish pardasini faqat `ready()` chaqirilgandan keyin olib tashlaydi.
 * Ilova uchta marshrutga bo'lingan (`/`, `/menyu/:kod`, `/buyurtma/:token`)
 * va ular alohida sahifa komponentlari — agar bu chaqiruv faqat bittasida
 * (masalan faqat App.tsx ichida) bo'lsa, boshqa marshrutlar ochilganda
 * parda hech qachon olinmaydi: sahifa aslida to'liq render bo'lsa ham
 * foydalanuvchi Telegram ichida bo'sh oyna ko'radi. Shuning uchun bu hook
 * AppRoutes'da, `<Routes>` qaysi marshrutni tanlashidan qat'iy nazar,
 * bitta joyda chaqiriladi.
 */
export function useTelegramChrome() {
  useEffect(() => {
    if (!tg) return;
    tg.ready();
    tg.expand();
    const applyScheme = () => {
      document.documentElement.dataset.tgScheme = tg.colorScheme;
    };
    applyScheme();
    tg.setHeaderColor?.('secondary_bg_color');
    tg.setBackgroundColor?.('bg_color');
    tg.onEvent('themeChanged', applyScheme);
    return () => tg.offEvent('themeChanged', applyScheme);
  }, []);
}
