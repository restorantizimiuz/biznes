import { useEffect } from 'react';
import { getTelegramWebApp } from '../telegram';

const tg = getTelegramWebApp();

/**
 * TELEGRAM MINI APP BOOTSTRAP — barcha sahifalar uchun bitta joyda.
 *
 * `ready()` chaqirilmasa Telegram o'zining yuklanish pardasini olib
 * tashlamaydi: sahifa to'liq yuklangan va React chizib bo'lgan bo'lsa ham
 * foydalanuvchi **bo'sh oyna** ko'rib turadi. Aynan shu sodir bo'lgan —
 * ochiq veb sahifalar (`/menyu/<kod>`, `/buyurtma/<token>`) alohida
 * marshrutlarga ajratilganda bu chaqiruv `App.tsx` ichida qolib ketgan,
 * ya'ni ular Telegram ichida ochilganda hech narsa ko'rinmagan.
 *
 * Shu sababli hook router darajasida chaqiriladi: yangi sahifa
 * qo'shilganda uni takrorlash yodda tutilishi shart emas.
 *
 * `data-tg-scheme` ham shu yerda qo'yiladi — u bo'lmasa sahifa Telegram
 * mavzusiga emas, qurilma (OS) mavzusiga qarab rang tanlaydi: qorong'i
 * Telegram ichida yorqin sahifa ochilib qolishi mumkin (qarang: index.css).
 *
 * Telegram tashqarisida (oddiy brauzer, Instagram'dan kelgan mijoz)
 * `tg` mavjud bo'lsa ham zararsiz: skript telegram.org'dan har doim
 * yuklanadi, uning `ready()`/`expand()` chaqiruvlari esa hech narsa
 * qilmaydi.
 */
export default function useTelegramChrome() {
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
