import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { CartLine, CheckoutRequest, Order, Product } from './shop.models';
import { DEMO_PRODUCTS } from './demo-products';

declare global {
  interface Window {
    __SHOPPASTO_CONFIG__?: { apiBaseUrl?: string; demoMode?: boolean };
  }
}

export function isShopPastoDemoMode(): boolean {
  return typeof window !== 'undefined' && window.__SHOPPASTO_CONFIG__?.demoMode === true;
}

function apiBaseUrl(): string {
  const configured = typeof window === 'undefined' ? '' : window.__SHOPPASTO_CONFIG__?.apiBaseUrl?.trim();
  return (configured || '/api').replace(/\/+$/, '');
}

@Injectable({ providedIn: 'root' })
export class ShopApi {
  readonly isDemo = isShopPastoDemoMode();
  private readonly base = apiBaseUrl();
  constructor(private readonly http: HttpClient) {}

  products(q = '', category = ''): Observable<Product[]> {
    if (this.isDemo) {
      const search = q.trim().toLocaleLowerCase('es');
      return of(DEMO_PRODUCTS.filter(product =>
        product.active
        && (!search || `${product.name} ${product.description} ${product.category}`.toLocaleLowerCase('es').includes(search))
        && (!category || product.category === category),
      ));
    }
    let params = new HttpParams();
    if (q.trim()) params = params.set('q', q.trim());
    if (category) params = params.set('category', category);
    return this.http.get<Product[]>(`${this.base}/products`, { params });
  }
  product(id: number): Observable<Product> {
    if (this.isDemo) {
      const product = DEMO_PRODUCTS.find(item => item.id === id && item.active);
      return product
        ? of(product)
        : throwError(() => new Error('No encontramos ese producto de muestra.'));
    }
    return this.http.get<Product>(`${this.base}/products/${id}`);
  }
  createOrder(body: CheckoutRequest, key: string): Observable<Order> {
    if (this.isDemo) return throwError(() => new Error('Los pedidos están desactivados en esta demo.'));
    return this.http.post<Order>(`${this.base}/orders`, body, { headers: new HttpHeaders({ 'Idempotency-Key': key }) });
  }
  orders(email: string): Observable<Order[]> {
    if (this.isDemo) return throwError(() => new Error('La consulta de pedidos no está disponible en esta demo.'));
    return this.http.get<Order[]>(`${this.base}/orders`, { params: new HttpParams().set('email', email.trim()) });
  }
  order(id: string): Observable<Order> {
    if (this.isDemo) return throwError(() => new Error('La consulta de pedidos no está disponible en esta demo.'));
    return this.http.get<Order>(`${this.base}/orders/${encodeURIComponent(id)}`);
  }
  cancel(id: string): Observable<Order> {
    if (this.isDemo) return throwError(() => new Error('La cancelación de pedidos no está disponible en esta demo.'));
    return this.http.post<Order>(`${this.base}/orders/${encodeURIComponent(id)}/cancel`, {});
  }
}

@Injectable({ providedIn: 'root' })
export class CartStore {
  private readonly storageKey = isShopPastoDemoMode() ? 'shoppasto-demo-cart-v1' : 'shoppasto-cart-v1';
  readonly lines = signal<CartLine[]>(this.readCart());
  readonly count = signal(0);

  constructor() { this.refreshCount(); }
  private readCart(): CartLine[] {
    try {
      const raw = localStorage.getItem(this.storageKey);
      const items = raw ? JSON.parse(raw) as CartLine[] : [];
      return Array.isArray(items) ? items.filter(line => line?.product && Number.isFinite(line.quantity) && line.quantity > 0) : [];
    } catch { return []; }
  }
  private persist(): void {
    localStorage.setItem(this.storageKey, JSON.stringify(this.lines()));
    this.refreshCount();
  }
  private refreshCount(): void { this.count.set(this.lines().reduce((sum, line) => sum + line.quantity, 0)); }
  add(product: Product, quantity = 1): void {
    if (product.stock < 1 || quantity < 1) return;
    const existing = this.lines().find(line => line.product.id === product.id);
    this.lines.set(existing
      ? this.lines().map(line => line.product.id === product.id ? { ...line, product, quantity: Math.min(product.stock, line.quantity + quantity) } : line)
      : [...this.lines(), { product, quantity: Math.min(product.stock, quantity) }]);
    this.persist();
  }
  update(id: number, quantity: number): void {
    if (quantity <= 0) { this.remove(id); return; }
    const line = this.lines().find(item => item.product.id === id);
    if (line && line.product.stock < 1) { this.remove(id); return; }
    this.lines.set(this.lines().map(line => line.product.id === id ? { ...line, quantity: Math.min(line.product.stock, quantity) } : line));
    this.persist();
  }
  remove(id: number): void { this.lines.set(this.lines().filter(line => line.product.id !== id)); this.persist(); }
  clear(): void { this.lines.set([]); this.persist(); }
  total(): number { return this.lines().reduce((sum, line) => sum + line.product.price_cop * line.quantity, 0); }
}

export function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'No pudimos conectar con la tienda. Revisa tu conexión e inténtalo de nuevo.';
    const detail = error.error?.detail;
    if (typeof detail === 'string') return detail;
    if (error.status === 409) return 'No fue posible reservar las cantidades solicitadas. Revisa el inventario e inténtalo de nuevo.';
    if (error.status === 404) return 'No encontramos ese producto o pedido.';
    if (error.status === 503 || error.status === 504) return 'El servicio de pedidos está temporalmente ocupado. Tu intento se puede reintentar de forma segura.';
  }
  return 'Ocurrió un problema inesperado. Inténtalo de nuevo.';
}

export function cop(amount: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);
}
