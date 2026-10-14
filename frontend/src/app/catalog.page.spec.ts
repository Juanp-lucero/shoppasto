import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Product } from './shop.models';
import { CatalogPage } from './shop.pages';

const product: Product = {
  id: 12,
  name: 'Papa criolla de prueba',
  description: 'Producto regional de prueba.',
  category: 'Huerta',
  price_cop: 6500,
  image_url: '',
  stock: 4,
  active: true,
};

describe('CatalogPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [CatalogPage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('shows loading, then renders API catalog data', async () => {
    const fixture = TestBed.createComponent(CatalogPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Cargando productos"]')).toBeTruthy();

    const request = http.expectOne('/api/products');
    expect(request.request.method).toBe('GET');
    request.flush([product]);
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain(product.name);
    expect(fixture.nativeElement.textContent).toContain('1 producto');
  });

  it('shows API errors and retries into the empty state', async () => {
    const fixture = TestBed.createComponent(CatalogPage);
    fixture.detectChanges();
    http.expectOne('/api/products').flush(
      { detail: 'Servicio temporalmente no disponible.' },
      { status: 503, statusText: 'Service Unavailable' },
    );
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('No pudimos abrir el mercado');
    expect(fixture.nativeElement.textContent).toContain('Servicio temporalmente no disponible.');

    fixture.nativeElement.querySelector('.error-state button').click();
    http.expectOne('/api/products').flush([]);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Aún no encontramos eso');
  });
});
