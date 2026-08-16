import axios from 'axios';
import type { MenuResponse, PaymentMethod, ProfileResponse, TrackedOrder } from './types';
import { getTelegramWebApp } from './telegram';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api/v1';

// VITE_API_URL build-vaqtida JS ichiga "quyiladi" — agar deploy sozlamalarida bu
// qiymat xato kiritilgan bo'lsa (masalan "https://" o'rniga "ttps://"), bunday
// so'rovlar brauzer tomonidan tarmoqqa chiqmasdanoq (Network panelida ko'rinmasdan,
// konsolda xatosiz) rad etiladi — aniqlash juda qiyin bo'ladi. Shuning uchun bu
// yerda darhol, aniq ogohlantirish beramiz.
if (!/^https?:\/\//.test(API_BASE_URL)) {
  console.error(
    `[api] VITE_API_URL noto'g'ri sozlangan: ${JSON.stringify(API_BASE_URL)} — ` +
      `"http://" yoki "https://" bilan boshlanishi shart. Deploy sozlamalarini (Railway/Vercel) tekshiring.`,
  );
}

const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

// Kassadan yuklangan rasmlar "/uploads/..." ko'rinishida nisbiy havola bilan
// keladi — ularni backend manziliga bog'laymiz (WebApp boshqa domenda ishlaydi).
export function resolveImageUrl(url: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  const origin = (apiClient.defaults.baseURL ?? '').replace(/\/api\/v1\/?$/, '');
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
}

export const getMenuByTableToken = (tableToken: string) =>
  apiClient.get<MenuResponse>(`/qr/${tableToken}/menu`).then((r) => r.data);

// Bot /start orqali WebApp ochilganda (hali hech qanday stol tanlanmagan holatda)
// menyuni ko'rsatish uchun — business_code orqali (bot ?business= parametrini yuboradi).
export const getMenuByBusinessCode = (businessCode: string) =>
  apiClient
    .get<MenuResponse>('/menu', { params: { business_code: businessCode } })
    .then((r) => r.data);

export const createTelegramOrder = (
  tableToken: string,
  initData: string,
  items: { product_id: string; quantity: number }[],
) =>
  apiClient
    .post<{ id: string; added_total: number }>(`/telegram/${tableToken}/order`, {
      init_data: initData,
      items,
    })
    .then((r) => r.data);

/**
 * Ochiq veb sahifadan buyurtma (Instagram havolasi orqali kirgan mijoz).
 *
 * Telegram talab qilinmaydi va hisob ochish shart emas — shuning uchun
 * `init_data` ham yo'q. Javobdagi `public_token` — kuzatuv havolasi kaliti.
 */
export const createWebOrder = (body: {
  business_code: string;
  order_type: 'delivery' | 'pickup';
  customer_name: string;
  phone: string;
  address: string;
  note: string;
  lat: number | null;
  lng: number | null;
  payment_method: PaymentMethod;
  items: { product_id: string; quantity: number }[];
}) =>
  apiClient
    .post<{ order_id: string; public_token: string; total_amount: number }>('/web/order', {
      ...body,
      // Telegram ichida bo'lsak buyurtma mijoz profiliga bog'lanadi va
      // "Mening buyurtmalarim" ro'yxatida ko'rinadi. Oddiy brauzerda bo'sh
      // ketadi — backend uni ixtiyoriy deb qabul qiladi va buyurtmani
      // baribir yaratadi (bu sahifada hisob ochish talab qilinmaydi).
      init_data: getTelegramWebApp()?.initData ?? '',
    })
    .then((r) => r.data);

/**
 * MIJOZ PROFILI — faqat Telegram ichida ishlaydi.
 *
 * Auth JWT emas: `Authorization: tma <initData>` sarlavhasi. initData
 * imzosini backend tekshiradi (telegram.go), shuning uchun mijoz o'zini
 * boshqa kishi qilib ko'rsata olmaydi.
 *
 * Nega sarlavha, nega so'rov parametri emas: initData mijozning ismi va
 * telegram ID'sini o'z ichiga oladi — URL'da bo'lsa loglarga tushib
 * qolardi. `Authorization` backend CORS ro'yxatida allaqachon ruxsat
 * etilgan.
 */
function telegramAuthHeaders(): Record<string, string> {
  const initData = getTelegramWebApp()?.initData ?? '';
  return { Authorization: `tma ${initData}` };
}

export const getTelegramProfile = (businessCode: string) =>
  apiClient
    .get<ProfileResponse>('/telegram/me', {
      params: { business_code: businessCode },
      headers: telegramAuthHeaders(),
    })
    .then((r) => r.data);

/**
 * Profilni saqlash. Yuborilmagan maydon o'zgarmaydi, bo'sh satr esa
 * maydonni tozalaydi (backend ikkalasini ajratadi).
 */
export const updateTelegramProfile = (
  businessCode: string,
  body: { phone?: string; delivery_address?: string; delivery_note?: string },
) =>
  apiClient
    .patch<{ success: boolean }>('/telegram/me', body, {
      params: { business_code: businessCode },
      headers: telegramAuthHeaders(),
    })
    .then((r) => r.data);

export const getWebOrderStatus = (token: string) =>
  apiClient.get<TrackedOrder>(`/web/orders/${token}`).then((r) => r.data);

/**
 * Koordinatani manzil matniga aylantirish.
 *
 * Backend orqali o'tadi (to'g'ridan-to'g'ri Nominatim'ga emas): u yerda
 * kerakli User-Agent qo'yiladi, chastota ushlab turiladi va natija keshlanadi.
 * Xato bo'lsa bo'sh satr qaytadi — mijoz manzilni qo'lda yozaveradi.
 */
export const reverseGeocode = (lat: number, lng: number) =>
  apiClient
    .get<{ address: string }>('/geo/reverse', { params: { lat, lng } })
    .then((r) => r.data.address ?? '')
    .catch(() => '');
