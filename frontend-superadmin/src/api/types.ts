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

/** GET /platform/users va /platform/staff — bir xil javob shakli. */
export interface PlatformUser {
  id: string;
  business_id: string;
  business_name: string;
  full_name: string;
  login: string;
  role: string;
  is_active: boolean;
  created_at: string;
  last_activity_at: string | null;
}

export interface PlatformUsersResponse {
  users: PlatformUser[];
  limit: number;
  offset: number;
}

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Egasi',
  admin: 'Admin',
  cashier: 'Kassir',
  waiter: 'Ofitsiant',
};

/** GET /platform/audit-logs */
export interface PlatformAuditEntry {
  id: string;
  created_at: string;
  business_id: string;
  business_name: string;
  action: string;
  actor: string;
  order_id: string | null;
  details: Record<string, unknown> | null;
}

export interface PlatformAuditResponse {
  entries: PlatformAuditEntry[];
  limit: number;
  offset: number;
}

// Backenddagi handlers/audit.go'dagi audit konstantalari bilan bir xil ro'yxat.
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  order_created: 'Buyurtma yaratildi',
  order_activated: 'Buyurtma qabul qilindi',
  item_added: "Taom qo'shildi",
  item_removed: "Taom o'chirildi",
  item_qty_changed: "Miqdor o'zgartirildi",
  discount_applied: 'Chegirma berildi',
  order_paid: "To'landi",
  order_cancelled: 'Bekor qilindi',
  kitchen_status_changed: "Oshxona holati o'zgardi",
  order_edited_after_close: 'Yopilgandan keyin tahrirlandi',
  receipt_printed: 'Chek chiqarildi',
};
