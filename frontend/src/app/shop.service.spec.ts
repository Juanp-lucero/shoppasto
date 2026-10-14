import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CartStore, ShopApi } from './shop.service';
import { Product } from './shop.models';

const product: Product = {
  id: 7,
  name: 'Papa criolla',
  description: 'Papa de Nariño',
  category: 'Tubérculos',
  price_cop: 3000,
  image_url: '',
  stock: 3,
  active: true,
};

describe('ShopPasto storefront services', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('filters the real product endpoint by query and category', () => {
    const api = TestBed.inject(ShopApi);
    api.products('papa', 'Tubérculos').subscribe();

    const request = http.expectOne('/api/products?q=papa&category=Tub%C3%A9rculos');
    expect(request.request.method).toBe('GET');
    request.flush([product]);
  });

  it('persists cart lines, caps quantity to stock, and calculates totals', () => {
    const cart = TestBed.inject(CartStore);
    cart.add(product, 2);
    cart.add(product, 5);

    expect(cart.count()).toBe(3);
    expect(cart.total()).toBe(9000);
    expect(JSON.parse(localStorage.getItem('shoppasto-cart-v1') ?? '[]')[0].quantity).toBe(3);

    cart.update(product.id, 2);
    expect(cart.total()).toBe(6000);
    cart.remove(product.id);
    expect(cart.count()).toBe(0);
  });

  it('sends the idempotency key when creating an order', () => {
    const api = TestBed.inject(ShopApi);
    api.createOrder(
      {
        customer_name: 'Ana Test',
        customer_email: 'ana@example.com',
        items: [{ product_id: product.id, quantity: 1 }],
      },
      'stable-attempt-key',
    ).subscribe();

    const request = http.expectOne('/api/orders');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Idempotency-Key')).toBe('stable-attempt-key');
    request.flush({ id: 'order-id' });
  });
});
