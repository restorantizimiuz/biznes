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

export interface MenuResponse {
  table_id: string;
  table_name: string;
  business_id: string;
  business_name: string;
  categories: MenuCategory[];
}

export interface CartLine {
  product: Product;
  quantity: number;
}
