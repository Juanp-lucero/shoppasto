import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    window.__SHOPPASTO_CONFIG__ = undefined;
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    window.__SHOPPASTO_CONFIG__ = undefined;
  });

  it('renders ShopPasto branding and accessible navigation', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand-name')?.textContent).toContain('shoppasto');
    expect(compiled.querySelector('nav[aria-label="Navegación principal"]')).toBeTruthy();
    expect(compiled.querySelector('.skip-link')?.textContent).toContain('Saltar al contenido');
  });

  it('shows a clear notice when running the frontend-only demo', () => {
    window.__SHOPPASTO_CONFIG__ = { demoMode: true };
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.demo-banner')?.textContent).toContain('No se aceptan pedidos reales');
  });
});
