export interface LoginResponse {
  token: string;
  user_id: string;
  full_name: string;
  role: string;
  business_id: string;
}

export interface Category {
  id: string;
  business_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface Product {
  id: string;
  category_id: string;
  business_id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  is_available: boolean;
}

export interface Floor {
  id: string;
  name: string;
  sort_order: number;
}

export interface Table {
  id: string;
  name: string;
  qr_code_token: string;
  status: 'empty' | 'occupied' | 'pending_payment';
}

export interface OrderItem {
  id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
}

export type OrderType = 'dine_in' | 'delivery' | 'pickup';

export interface ActiveOrder {
  id: string;
  table_id: string | null;
  table_name: string | null;
  source: string;
  status: 'new' | 'activated' | 'paid' | 'cancelled';
  kitchen_status: 'preparing' | 'ready';
  order_type: OrderType;
  customer_phone: string | null;
  delivery_address: string | null;
  total_amount: number;
  discount_amount: number;
  final_amount: number;
  telegram_username: string | null;
  telegram_id: number | null;
  items: OrderItem[];
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

// Printer sozlamalari chek bilan birga lokal printer-helper dasturiga
// yuboriladi — kassir ularni Sozlamalar bo'limidan kiritadi.
export interface PrinterSettings {
  mode: string;
  address: string;
  paper_width: number;
}

export interface Receipt {
  order_id: string;
  business_name: string;
  table_name: string | null;
  order_type: OrderType;
  customer_phone: string | null;
  delivery_address: string | null;
  items: ReceiptItem[];
  total_amount: number;
  discount_amount: number;
  final_amount: number;
  payment_methods: string[];
  paid_at: string | null;
  created_at: string;
  telegram_username?: string | null;
  is_pre_bill: boolean;
  printer?: PrinterSettings;
}

export interface Staff {
  id: string;
  full_name: string;
  login: string;
  role: string;
  is_active: boolean;
}

export interface DailySummary {
  from: string;
  to: string;
  total_orders: number;
  online_orders: number;
  total_revenue: number;
  cash_total: number;
  card_total: number;
  transfer_total: number;
}

export interface Settings {
  name: string;
  language: string;
  theme_mode: string;
  subscription_plan: SubscriptionPlan;
  subscription_status: string;
  subscription_ends_at: string | null;
  printer_mode: string;
  printer_address: string;
  printer_paper_width: number;
  notify_sound: boolean;
  features: Record<string, boolean>;
}

export type SubscriptionPlan = 'basic' | 'qr' | 'full';

export type UserRole = 'owner' | 'admin' | 'cashier' | 'waiter';

// ---------------------------------------------------------------------------
// Hisobot
// ---------------------------------------------------------------------------

export interface ReportOrder {
  id: string;
  created_at: string;
  table_id: string | null;
  table_name: string | null;
  source: string;
  status: 'new' | 'activated' | 'paid' | 'cancelled';
  order_type: OrderType;
  customer_phone: string | null;
  delivery_address: string | null;
  total_amount: number;
  discount_amount: number;
  discount_reason: string | null;
  final_amount: number;
  created_by: string | null;
  paid_by: string | null;
  waiter_name: string | null;
  payment_methods: string | null;
  /** Yopilgandan keyin tahrirlanganmi (hisobotda ✎ belgisi bilan ko'rsatiladi) */
  edited: boolean;
  items: OrderItem[];
}

export interface ReportActivity {
  id: string;
  created_at: string;
  action: string;
  actor: string;
  actor_role: string | null;
  order_id: string | null;
  table_name: string | null;
  details: Record<string, unknown> | null;
}

export interface ReportSummary {
  total_orders: number;
  online_orders: number;
  cancelled_orders: number;
  open_orders: number;
  total_revenue: number;
  discount_total: number;
  cash_total: number;
  card_total: number;
  transfer_total: number;
}

export interface DetailedReport {
  from: string;
  to: string;
  summary: ReportSummary;
  orders: ReportOrder[];
  activity: ReportActivity[];
}

/** Hisobot filtrlari — ekranda ko'rish va Excel yuklashga bir xil qo'llanadi. */
export interface ReportFilters {
  from: string;
  to: string;
  table_id?: string;
  source?: string;
  payment_method?: string;
  status?: string;
}

// ---------------------------------------------------------------------------
// Real-time bildirishnoma (WebSocket)
// ---------------------------------------------------------------------------

export interface OrderEvent {
  event: string;
  order_id: string;
  table_id?: string;
  table_name?: string;
  source?: string;
  order_type?: OrderType;
  amount?: number;
  from_customer: boolean;
}
