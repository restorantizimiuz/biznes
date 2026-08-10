import axios from 'axios';
import type { MenuResponse } from './types';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api/v1',
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

// Stolsiz buyurtma — mijoz uyda o'tirib yetkazib berish yoki olib ketishga buyurtma beradi.
export const createOnlineOrder = (body: {
  init_data: string;
  business_code: string;
  order_type: 'delivery' | 'pickup';
  phone: string;
  address: string;
  items: { product_id: string; quantity: number }[];
}) =>
  apiClient
    .post<{ id: string; total_amount: number }>('/telegram/order', body)
    .then((r) => r.data);
