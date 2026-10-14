import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable, forkJoin, map, of, tap, throwError } from 'rxjs';
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
  private readonly orderAccessStorage = 'shoppasto-order-access-v1';
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
    return this.http.post<Order>(`${this.base}/orders`, body, {
      headers: new HttpHeaders({ 'Idempotency-Key': key }),
    }).pipe(tap(order => this.rememberOrderAccess(order, order.access_token ?? '')));
  }
  orders(email: string, manualAccessToken = ''): Observable<Order[]> {
    if (this.isDemo) return throwError(() => new Error('La consulta de pedidos no está disponible en esta demo.'));
    const normalizedEmail = email.trim().toLowerCase();
    const savedTokens = this.readOrderAccess()
      .filter(record => record.email === normalizedEmail)
      .map(record => record.access_token);
    const tokens = [...new Set([...savedTokens, manualAccessToken.trim()].filter(Boolean))];
    if (!tokens.length) {
      return throwError(() => new Error(
        'El correo no basta para consultar pedidos. Ingresa la clave que recibiste al confirmar la compra.',
      ));
    }
    const params = new HttpParams().set('email', normalizedEmail);
    return forkJoin(tokens.map(token => this.http.get<Order[]>(`${this.base}/orders`, {
      params,
      headers: this.orderHeaders(token),
    }).pipe(tap(orders => orders.forEach(order => this.rememberOrderAccess(order, token)))))).pipe(
      map(groups => {
        const unique = new Map<string, Order>();
        groups.flat().forEach(order => unique.set(order.id, order));
        return [...unique.values()];
      }),
    );
  }
  order(id: string): Observable<Order> {
    if (this.isDemo) return throwError(() => new Error('La consulta de pedidos no está disponible en esta demo.'));
    const access = this.findOrderAccess(id);
    if (!access) return throwError(() => new Error('No encontramos la clave de acceso guardada para este pedido.'));
    return this.http.get<Order>(`${this.base}/orders/${encodeURIComponent(id)}`, {
      headers: this.orderHeaders(access.access_token),
    });
  }
  cancel(id: string): Observable<Order> {
    if (this.isDemo) return throwError(() => new Error('La cancelación de pedidos no está disponible en esta demo.'));
    const access = this.findOrderAccess(id);
    if (!access) return throwError(() => new Error('No encontramos la clave de acceso guardada para este pedido.'));
    return this.http.post<Order>(`${this.base}/orders/${encodeURIComponent(id)}/cancel`, {}, {
      headers: this.orderHeaders(access.access_token),
    });
  }
  private orderHeaders(token: string): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
  private readOrderAccess(): Array<{ id: string; email: string; access_token: string }> {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(this.orderAccessStorage) ?? '[]');
      if (!Array.isArray(raw)) return [];
      return raw.filter((item): item is { id: string; email: string; access_token: string } =>
        !!item && typeof item.id === 'string' && typeof item.email === 'string'
        && typeof item.access_token === 'string' && !!item.access_token,
      );
    } catch {
      return [];
    }
  }
  private findOrderAccess(id: string): { id: string; email: string; access_token: string } | undefined {
    return this.readOrderAccess().find(record => record.id === id);
  }
  private rememberOrderAccess(order: Order, accessToken: string): void {
    if (!accessToken) return;
    try {
      const records = this.readOrderAccess().filter(record => record.id !== order.id);
      records.push({
        id: order.id,
        email: order.customer_email.toLowerCase(),
        access_token: accessToken,
      });
      localStorage.setItem(this.orderAccessStorage, JSON.stringify(records));
    } catch {
      // The checkout success view still shows the key if browser storage is unavailable.
    }
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
