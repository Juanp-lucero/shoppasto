import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders ShopPasto branding and accessible navigation', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand-name')?.textContent).toContain('shoppasto');
    expect(compiled.querySelector('nav[aria-label="Navegación principal"]')).toBeTruthy();
    expect(compiled.querySelector('.skip-link')?.textContent).toContain('Saltar al contenido');
  });
});
