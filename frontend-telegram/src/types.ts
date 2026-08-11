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
  products: Product[];
}

export type OrderType = 'dine_in' | 'delivery' | 'pickup';

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
  kitchen_status: 'preparing' | 'ready';
  items: OrderItem[];
  total_amount: number;
  final_amount: number;
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
}

export interface CartLine {
  product: Product;
  quantity: number;
}
