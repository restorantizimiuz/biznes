import apiClient from './client';
import type {
  ActiveOrder,
  Category,
  DailySummary,
  Floor,
  LoginResponse,
  Product,
  Settings,
  Staff,
  Table,
} from './types';

export const login = (business_code: string, login: string, password: string) =>
  apiClient
    .post<LoginResponse>('/auth/login', { business_code, login, password })
    .then((r) => r.data);

export const listCategories = () =>
  apiClient.get<Category[]>('/menu/categories').then((r) => r.data ?? []);

export const createCategory = (name: string, sort_order = 0) =>
  apiClient.post('/menu/categories', { name, sort_order }).then((r) => r.data);

export const listProducts = (categoryId?: string) =>
  apiClient
    .get<Product[]>('/menu/products', { params: categoryId ? { category_id: categoryId } : {} })
    .then((r) => r.data ?? []);

export const createProduct = (body: {
  category_id: string;
  name: string;
  description: string;
  price: number;
  image_url?: string;
}) => apiClient.post('/menu/products', body).then((r) => r.data);

export const toggleProductAvailability = (id: string, is_available: boolean) =>
  apiClient.patch(`/menu/products/${id}/availability`, { is_available }).then((r) => r.data);

export const listFloors = () => apiClient.get<Floor[]>('/floors').then((r) => r.data ?? []);

export const createFloor = (name: string, sort_order = 0) =>
  apiClient.post('/floors', { name, sort_order }).then((r) => r.data);

export const listTables = (floorId: string) =>
  apiClient.get<Table[]>(`/floors/${floorId}/tables`).then((r) => r.data ?? []);

export const createTable = (floorId: string, name: string) =>
  apiClient.post(`/floors/${floorId}/tables`, { name }).then((r) => r.data);

export const getTableQR = (tableId: string) =>
  apiClient.get<{ url: string; token: string }>(`/tables/${tableId}/qr`).then((r) => r.data);

export const listActiveOrders = () =>
  apiClient.get<ActiveOrder[]>('/orders').then((r) => r.data ?? []);

export const createOrder = (body: {
  table_id: string;
  source: string;
  items: { product_id: string; quantity: number }[];
}) => apiClient.post('/orders', body).then((r) => r.data);

export const payOrder = (
  orderId: string,
  payments: { method: string; card_type?: string; amount: number }[],
) => apiClient.post(`/orders/${orderId}/pay`, { payments }).then((r) => r.data);

export const cancelOrder = (orderId: string, reason: string) =>
  apiClient.post(`/orders/${orderId}/cancel`, { reason }).then((r) => r.data);

export const listStaff = () => apiClient.get<Staff[]>('/staff').then((r) => r.data ?? []);

export const createStaff = (body: {
  full_name: string;
  login: string;
  password: string;
  role: string;
}) => apiClient.post('/staff', body).then((r) => r.data);

export const getDailySummary = (from: string, to: string) =>
  apiClient.get<DailySummary>('/reports/daily', { params: { from, to } }).then((r) => r.data);

export const exportReportUrl = (from: string, to: string) =>
  `${apiClient.defaults.baseURL}/reports/export?from=${from}&to=${to}`;

export const getSettings = () => apiClient.get<Settings>('/settings').then((r) => r.data);

export const updateSettings = (body: { language?: string; theme_mode?: string }) =>
  apiClient.patch('/settings', body).then((r) => r.data);
