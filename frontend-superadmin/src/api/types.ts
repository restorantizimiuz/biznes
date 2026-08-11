export interface PlatformLoginResponse {
  token: string;
  admin_id: string;
  full_name: string;
  login: string;
}

export type SubscriptionPlan = 'basic' | 'qr' | 'full';

/** Super-admin ko'radigan kafe kartochkasi: holati, obunasi, limitlari, faolligi. */
export interface Business {
  id: string;
  business_code: string;
  name: string;
  type: string;
  phone: string | null;
  language: string;
  is_active: boolean;
  created_at: string;
  max_tables: number;
  max_waiters: number;
  max_cashiers: number;
  table_count: number;
  waiter_count: number;
  cashier_count: number;
  subscription_plan: SubscriptionPlan | null;
  subscription_status: string | null;
  subscription_ends_at: string | null;
  last_activity_at: string | null;
  features: Record<string, boolean>;
}

export interface PlatformStats {
  total_businesses: number;
  active_businesses: number;
  total_users: number;
  orders_today: number;
  revenue_today: number;
}

export interface CreateBusinessBody {
  business_code: string;
  name: string;
  type: string;
  phone: string;
  owner_full_name: string;
  owner_login: string;
  owner_password: string;
  plan: SubscriptionPlan;
  duration_days: number;
}

// Backenddagi platformFeatureKeys bilan bir xil ro'yxat.
export const FEATURE_KEYS = [
  'qr_menu',
  'online_order',
  'telegram_bot',
  'receipt_print',
  'reports_export',
] as const;

export const FEATURE_LABELS: Record<string, string> = {
  qr_menu: 'QR menyu',
  online_order: 'Online buyurtma',
  telegram_bot: 'Telegram bot',
  receipt_print: 'Chek chiqarish',
  reports_export: 'Excel eksport',
};

export const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  basic: 'Oddiy',
  qr: 'QR menyu',
  full: "To'liq",
};
