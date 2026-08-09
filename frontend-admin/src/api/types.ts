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

export interface ActiveOrder {
  id: string;
  table_id: string | null;
  source: string;
  status: 'new' | 'activated' | 'paid' | 'cancelled';
  total_amount: number;
  final_amount: number;
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
  subscription_plan: string;
  subscription_status: string;
  subscription_ends_at: string | null;
}
