import axios from 'axios';
import type { MenuResponse, PaymentMethod, TrackedOrder } from './types';

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
    .post<{ order_id: string; public_token: string; total_amount: number }>('/web/order', body)
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
