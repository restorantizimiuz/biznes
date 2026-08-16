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

/**
 * Mijozning shu kafedagi profili (Telegram Mini App).
 *
 * Ism va username Telegram'dan keladi va tahrirlanmaydi — ular Telegram'ning
 * o'z ma'lumoti. Telefon, manzil va mo'ljal esa mijozning o'zi kiritadigan
 * maydonlar: bir marta saqlansa, keyingi checkout avtomatik to'ladi.
 */
export interface CustomerProfile {
  telegram_id: number;
  username: string | null;
  full_name: string;
  phone: string | null;
  delivery_address: string | null;
  delivery_note: string | null;
  orders_count: number;
  /** Faqat to'langan buyurtmalar summasi. */
  total_spent: number;
  first_order_at: string | null;
}

/** Profildagi buyurtmalar tarixining bitta qatori. */
export interface ProfileOrder {
  id: string;
  /**
   * Kuzatuv havolasi kaliti. Faqat uydan berilgan (delivery/pickup)
   * buyurtmada bo'ladi — stol buyurtmasida kuzatuv sahifasi ma'nosiz,
   * shuning uchun backend uni `null` qaytaradi.
   */
  public_token: string | null;
  created_at: string;
  status: 'new' | 'activated' | 'paid' | 'cancelled';
  kitchen_status: KitchenStatus;
  order_type: OrderType;
  table_name: string | null;
  total_amount: number;
  discount_amount: number;
  final_amount: number;
  items: OrderItem[];
}

export interface ProfileResponse {
  profile: CustomerProfile;
  orders: ProfileOrder[];
}

export interface MenuResponse {
  // table_id/table_name faqat stol-token orqali (getMenuByTableToken) so'ralganda keladi —
  // bot /start orqali (getMenuByBusinessCode) hali hech qanday stol tanlanmagan bo'ladi.
  table_id?: string;
  table_name?: string;
  business_id: string;
  // Ikkala endpoint ham qaytaradi — profil so'rovi kafeni shu kod bo'yicha
  // topadi (stol rejimida ilova faqat stol tokenini biladi).
  business_code: string;
  business_name: string;
  categories: MenuCategory[];
  active_order?: ActiveOrder | null;
  // Faqat getMenuByBusinessCode javobida keladi — uydan buyurtma sahifasi
  // qaysi turlar (stolga/yetkazib berish/olib ketish) ochiqligini shundan
  // biladi.
  order_types?: { dine_in: boolean; delivery: boolean; pickup: boolean };
}

export interface CartLine {
  product: Product;
  quantity: number;
}
