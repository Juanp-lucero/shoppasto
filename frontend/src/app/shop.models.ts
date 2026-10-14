export interface Product {
  id: number;
  name: string;
  description: string;
  category: string;
  price_cop: number;
  image_url: string;
  stock: number;
  active: boolean;
}

export interface OrderItem {
  product_id: number;
  product_name: string;
  unit_price_cop: number;
  quantity: number;
  line_total_cop: number;
}

export interface Order {
  id: string;
  access_token?: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  customer_name: string;
  customer_email: string;
  total_cop: number;
  created_at: string;
  items: OrderItem[];
}

export interface CheckoutItem { product_id: number; quantity: number; }
export interface CheckoutRequest { customer_name: string; customer_email: string; items: CheckoutItem[]; }
export interface CartLine { product: Product; quantity: number; }
