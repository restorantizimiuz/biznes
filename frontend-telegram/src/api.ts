import axios from 'axios';
import type { MenuResponse } from './types';

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
