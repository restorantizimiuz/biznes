import apiClient from './client';
import type {
  ActiveOrder,
  Category,
  DailySummary,
  DetailedReport,
  Floor,
  LoginResponse,
  Product,
  Receipt,
  ReportFilters,
  Settings,
  Staff,
  SubscriptionPlan,
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

export const updateCategory = (id: string, name: string) =>
  apiClient.patch(`/menu/categories/${id}`, { name }).then((r) => r.data);

export const deleteCategory = (id: string) =>
  apiClient.delete(`/menu/categories/${id}`).then((r) => r.data);

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

export const updateProduct = (
  id: string,
  body: {
    category_id: string;
    name: string;
    description: string;
    price: number;
    image_url?: string;
  },
) => apiClient.patch(`/menu/products/${id}`, body).then((r) => r.data);

export const deleteProduct = (id: string) =>
  apiClient.delete(`/menu/products/${id}`).then((r) => r.data);

export const toggleProductAvailability = (id: string, is_available: boolean) =>
  apiClient.patch(`/menu/products/${id}/availability`, { is_available }).then((r) => r.data);

// Kesilgan rasm JPEG blob sifatida yuboriladi; javobda "/uploads/..." havolasi keladi.
export const uploadImage = (blob: Blob) => {
  const form = new FormData();
  form.append('file', blob, 'photo.jpg');
  return apiClient.post<{ url: string }>('/uploads/image', form).then((r) => r.data);
};

export const listFloors = () => apiClient.get<Floor[]>('/floors').then((r) => r.data ?? []);

export const createFloor = (name: string, sort_order = 0) =>
  apiClient.post('/floors', { name, sort_order }).then((r) => r.data);

export const listTables = (floorId: string) =>
  apiClient.get<Table[]>(`/floors/${floorId}/tables`).then((r) => r.data ?? []);

export const updateFloor = (id: string, name: string) =>
  apiClient.patch(`/floors/${id}`, { name }).then((r) => r.data);

export const deleteFloor = (id: string) => apiClient.delete(`/floors/${id}`).then((r) => r.data);

export const createTable = (floorId: string, name: string) =>
  apiClient.post(`/floors/${floorId}/tables`, { name }).then((r) => r.data);

export const updateTable = (id: string, name: string) =>
  apiClient.patch(`/tables/${id}`, { name }).then((r) => r.data);

export const deleteTable = (id: string) => apiClient.delete(`/tables/${id}`).then((r) => r.data);

export const getTableQR = (tableId: string) =>
  apiClient.get<{ url: string; token: string }>(`/tables/${tableId}/qr`).then((r) => r.data);

export const listActiveOrders = () =>
  apiClient.get<ActiveOrder[]>('/orders').then((r) => r.data ?? []);

export const createOrder = (
  table_id: string,
  items: { product_id: string; quantity: number }[],
) => apiClient.post('/orders', { table_id, source: 'cashier', items }).then((r) => r.data);

export const addOrderItems = (
  orderId: string,
  items: { product_id: string; quantity: number }[],
) => apiClient.post(`/orders/${orderId}/items`, { items }).then((r) => r.data);

export const activateOrder = (orderId: string) =>
  apiClient.post(`/orders/${orderId}/activate`).then((r) => r.data);

export const updateKitchenStatus = (orderId: string, status: 'preparing' | 'ready') =>
  apiClient.post(`/orders/${orderId}/kitchen-status`, { status }).then((r) => r.data);

export const updateOrderItem = (orderId: string, itemId: string, quantity: number) =>
  apiClient.patch(`/orders/${orderId}/items/${itemId}`, { quantity }).then((r) => r.data);

export const deleteOrderItem = (orderId: string, itemId: string) =>
  apiClient
    .delete<{ order_cancelled: boolean }>(`/orders/${orderId}/items/${itemId}`)
    .then((r) => r.data);

export const applyDiscount = (orderId: string, discount_amount: number, reason: string) =>
  apiClient.post(`/orders/${orderId}/discount`, { discount_amount, reason }).then((r) => r.data);

export const payOrder = (
  orderId: string,
  payments: { method: string; card_type?: string; amount: number }[],
) => apiClient.post(`/orders/${orderId}/pay`, { payments }).then((r) => r.data);

export const cancelOrder = (orderId: string, reason: string) =>
  apiClient.post(`/orders/${orderId}/cancel`, { reason }).then((r) => r.data);

// preBill=true — to'lovdan oldingi hisob-faktura ("to'lanmagan" deb belgilanadi).
export const getReceipt = (orderId: string, preBill = false) =>
  apiClient
    .get<Receipt>(`/orders/${orderId}/receipt`, { params: preBill ? { pre_bill: 1 } : {} })
    .then((r) => r.data);

export const markReceiptPrinted = (orderId: string, preBill = false) =>
  apiClient.post(`/orders/${orderId}/receipt-printed`, { pre_bill: preBill }).then((r) => r.data);

export const getTestReceipt = () =>
  apiClient.get<Receipt>('/printer/test-receipt').then((r) => r.data);

export const sendReceiptTelegram = (orderId: string) =>
  apiClient.post(`/orders/${orderId}/send-receipt-telegram`).then((r) => r.data);

export const listStaff = () => apiClient.get<Staff[]>('/staff').then((r) => r.data ?? []);

export const deleteStaff = (id: string) => apiClient.delete(`/staff/${id}`).then((r) => r.data);

export const createStaff = (body: {
  full_name: string;
  login: string;
  password: string;
  role: string;
}) => apiClient.post('/staff', body).then((r) => r.data);

export const getDailySummary = (from: string, to: string) =>
  apiClient.get<DailySummary>('/reports/daily', { params: { from, to } }).then((r) => r.data);

// Filtrlardan bo'sh qiymatlarni olib tashlaymiz — ko'rish va Excel yuklash
// bir xil parametrlar bilan ishlashi uchun bitta joyda tayyorlanadi.
function cleanFilters(filters: ReportFilters): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''),
  ) as Record<string, string>;
}

export const getDetailedReport = (filters: ReportFilters) =>
  apiClient
    .get<DetailedReport>('/reports/detailed', { params: cleanFilters(filters) })
    .then((r) => r.data);

export const downloadReportExcel = async (filters: ReportFilters) => {
  const res = await apiClient.get('/reports/export', {
    params: cleanFilters(filters),
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = `hisobot_${filters.from}_${filters.to}.xlsx`;
  link.click();
  window.URL.revokeObjectURL(url);
};

// --- Yopilgan buyurtmani tuzatish (faqat owner/admin) ---

export const updateClosedOrderPayment = (
  orderId: string,
  body: { method: string; card_type?: string; amount?: number; reason: string },
) => apiClient.patch(`/reports/orders/${orderId}/payment`, body).then((r) => r.data);

export const addClosedOrderItem = (
  orderId: string,
  body: { product_id: string; quantity: number; reason: string },
) => apiClient.post(`/reports/orders/${orderId}/items`, body).then((r) => r.data);

export const deleteClosedOrderItem = (orderId: string, itemId: string, reason: string) =>
  apiClient
    .delete(`/reports/orders/${orderId}/items/${itemId}`, { params: { reason } })
    .then((r) => r.data);

export const revertClosedOrder = (orderId: string, reason: string) =>
  apiClient.post(`/reports/orders/${orderId}/revert`, { reason }).then((r) => r.data);

export const getSettings = () => apiClient.get<Settings>('/settings').then((r) => r.data);

export const updateSettings = (body: {
  name?: string;
  language?: string;
  theme_mode?: string;
  printer_mode?: string;
  printer_address?: string;
  printer_paper_width?: number;
  notify_sound?: boolean;
}) => apiClient.patch('/settings', body).then((r) => r.data);

export const updateSubscription = (plan: SubscriptionPlan) =>
  apiClient.post('/settings/subscription', { plan }).then((r) => r.data);

// WebSocket manzili: brauzerning WebSocket API'si Authorization sarlavhasini
// yubora olmaydi, shuning uchun token so'rov parametrida beriladi.
export function ordersSocketUrl(token: string): string {
  const base = apiClient.defaults.baseURL ?? '';
  const absolute = new URL(base, window.location.origin);
  absolute.protocol = absolute.protocol === 'https:' ? 'wss:' : 'ws:';
  absolute.pathname = `${absolute.pathname.replace(/\/$/, '')}/ws/orders`;
  absolute.search = `?token=${encodeURIComponent(token)}`;
  return absolute.toString();
}
