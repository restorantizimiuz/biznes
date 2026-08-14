export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
}

export interface MenuCategory {
  id: string;
  name: string;
  /** Kassadan yuklanadi; bo'sh bo'lsa birinchi rasmli taomdan olinadi. */
  image_url?: string;
  description?: string;
  products: Product[];
}

export type OrderType = 'dine_in' | 'delivery' | 'pickup';

/** Veb buyurtmada mijoz tanlaydigan to'lov usuli (niyat, haqiqiy to'lov emas). */
export type PaymentMethod = 'cash' | 'card' | 'transfer';

/**
 * Tayyorlash bosqichi. 'delivering' va 'delivered' faqat yetkazib berish
 * buyurtmalarida bo'ladi — backend order_type ga qarab tekshiradi.
 */
export type KitchenStatus = 'preparing' | 'ready' | 'delivering' | 'delivered';

export interface OrderItem {
  product_name: string;
  unit_price: number;
  quantity: number;
}

// Stolning hozirgi to'lanmagan buyurtmasi — mijoz kassir kiritgan taomlarni ham
// ko'radi, chunki bitta stol = bitta umumiy buyurtma.
export interface ActiveOrder {
  id: string;
  status: 'new' | 'activated';
  kitchen_status: KitchenStatus;
  items: OrderItem[];
  total_amount: number;
  final_amount: number;
}

/** Mijozning kuzatuv sahifasi uchun — public_token orqali ochiladi. */
export interface TrackedOrder {
  business_name: string;
  business_code: string;
  status: 'new' | 'activated' | 'paid' | 'cancelled';
  kitchen_status: KitchenStatus;
  order_type: OrderType;
  customer_name: string;
  delivery_address: string | null;
  delivery_note: string | null;
  preferred_payment_method: PaymentMethod | null;
  total_amount: number;
  discount_amount: number;
  final_amount: number;
  created_at: string;
  items: OrderItem[];
}

export interface MenuResponse {
  // table_id/table_name faqat stol-token orqali (getMenuByTableToken) so'ralganda keladi —
  // bot /start orqali (getMenuByBusinessCode) hali hech qanday stol tanlanmagan bo'ladi.
  table_id?: string;
  table_name?: string;
  business_id: string;
  business_name: string;
  categories: MenuCategory[];
  active_order?: ActiveOrder | null;
  // Faqat getMenuByBusinessCode javobida keladi — uydan buyurtma sahifasi
  // qaysi turlar (yetkazib berish/olib ketish) ochiqligini shundan biladi.
  order_types?: { delivery: boolean; pickup: boolean };
}

export interface CartLine {
  product: Product;
  quantity: number;
}
