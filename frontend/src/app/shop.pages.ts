import { Component, OnInit, inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CartStore, ShopApi, cop, errorMessage } from './shop.service';
import { CheckoutRequest, Order, Product } from './shop.models';

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <section class="hero-band">
      <div class="page-wrap hero-grid">
        <div class="hero-copy enter">
          <div class="eyebrow"><span class="sun-dot"></span> Mercado local · Pasto, Nariño</div>
          <h1 class="serif">Lo bueno de<br>nuestra <em>tierra.</em></h1>
          <p>Alimentos de altura, elegidos en origen y traídos desde las manos que los cultivan.</p>
          <a class="hero-cta" href="#productos">Explorar el mercado <span aria-hidden="true">→</span></a>
          <div class="origin-stamp"><span>100%</span><small>origen<br>regional</small></div>
        </div>
        <div class="hero-art" aria-label="Ilustración de productos frescos de la región">
          <div class="sun"></div><div class="mountain mountain-back"></div><div class="mountain mountain-front"></div>
          <div class="produce-bowl"><i class="leaf leaf-one"></i><i class="leaf leaf-two"></i><i class="produce tomato"></i><i class="produce potato"></i><i class="produce corn"></i><i class="produce berry"></i></div>
          <div class="art-caption"><span>01 / 04</span><b>De aquí, de verdad.</b></div>
          <div class="art-ribbon">cosecha<br>cercana</div>
        </div>
      </div>
      <div class="hero-bottom page-wrap"><span>Pequeños productores, sabores grandes.</span><span class="hero-line"></span><span>Temporada viva · Selección de hoy</span></div>
    </section>
    <section class="market-content page-wrap" id="productos">
      <div class="section-heading">
        <div><div class="eyebrow">La selección de la región</div><h2 class="serif">Encuentra algo <em>bueno.</em></h2></div>
        <span class="count-label">{{ products.length }} {{ products.length === 1 ? 'producto' : 'productos' }}</span>
      </div>
      <form class="search-row" (ngSubmit)="loadProducts()">
        <label class="searchbox"><span class="search-symbol" aria-hidden="true"></span><span class="visually-hidden">Buscar productos</span><input name="query" [(ngModel)]="query" placeholder="¿Qué se te antoja?" autocomplete="off"><button type="button" class="clear-search" (click)="query=''; loadProducts()" [hidden]="!query">Limpiar</button></label>
        <label class="category-select"><span class="visually-hidden">Filtrar por categoría</span><select name="category" [(ngModel)]="category" (ngModelChange)="loadProducts()"><option value="">Todas las categorías</option>@for (item of categories; track item) { <option [value]="item">{{ item }}</option> }</select></label>
        <button class="btn btn--tomato search-button" type="submit">Buscar</button>
      </form>
      @if (loading) {
        <div class="product-grid" aria-label="Cargando productos" aria-busy="true">@for (item of [1,2,3,4]; track item) { <div class="skeleton product-skeleton"><span></span><i></i><i></i></div> }</div>
      } @else if (error) {
        <div class="empty-state error-state"><div class="empty-mark" aria-hidden="true">!</div><h3>No pudimos abrir el mercado</h3><p>{{ error }}</p><button class="btn" type="button" (click)="loadProducts()">Intentar de nuevo</button></div>
      } @else if (!products.length) {
        <div class="empty-state"><div class="empty-mark empty-mark--leaf" aria-hidden="true">N</div><h3>Aún no encontramos eso</h3><p>Prueba con otro nombre o vuelve a ver toda la selección regional.</p><button class="btn btn--outline" type="button" (click)="resetFilters()">Ver todos los productos</button></div>
      } @else {
        <div class="product-grid enter">
          @for (product of products; track product.id; let i = $index) {
            <article class="product-card" [style.animation-delay]="(i * 45) + 'ms'">
              <a class="product-visual" [routerLink]="['/products', product.id]" [attr.aria-label]="'Ver ' + product.name">
                @if (product.image_url && !failedImages.has(product.id)) { <img [src]="product.image_url" [alt]="product.name" (error)="imageFailed(product.id)"> }
                @else { <div class="produce-fallback" [attr.data-kind]="kind(product.category)"><span class="fallback-orbit"></span><span class="fallback-leaf"></span><span class="fallback-name">{{ initials(product.name) }}</span></div> }
                <span class="origin-tag">De la región</span>
              </a>
              <div class="product-details"><div class="product-category">{{ product.category }}</div><a class="product-title" [routerLink]="['/products', product.id]">{{ product.name }}</a><p>{{ product.description }}</p>
                <div class="product-buy"><strong>{{ money(product.price_cop) }}</strong><button type="button" class="add-btn" [disabled]="product.stock <= 0" (click)="add(product)" [attr.aria-label]="'Agregar ' + product.name + ' a la canasta'"><span aria-hidden="true">+</span><span class="visually-hidden">Agregar a la canasta</span></button></div>
                <span class="stock-label">{{ product.stock > 0 ? product.stock + ' disponibles' : 'Agotado por ahora' }}</span>
              </div>
            </article>
          }
        </div>
      }
      <div class="market-note"><span class="note-sun" aria-hidden="true"></span><p><b>Sin vueltas.</b> Conocemos el origen de cada cosa que llega a tu canasta.</p><a routerLink="/orders">Consulta tus pedidos <span aria-hidden="true">→</span></a></div>
    </section>
  `,
  styles: [`
    .hero-band { overflow: hidden; background: #eee5d1; position: relative; }
    .hero-grid { min-height: 500px; display: grid; grid-template-columns: .92fr 1.08fr; align-items: center; gap: 24px; }
    .hero-copy { position: relative; padding: 52px 0 56px 5.5%; z-index: 1; }
    .eyebrow { display:flex; align-items:center; gap:9px; }
    .sun-dot { display:block; width:9px; height:9px; background:var(--tomato); border-radius:50%; box-shadow:0 0 0 4px #bd4b3218; }
    h1 { font-size: clamp(3.6rem, 6vw, 5.7rem); letter-spacing:-.065em; line-height:.93; margin:23px 0 20px; color:#323326; }
    h1 em, h2 em { color:var(--tomato); font-weight:500; }
    .hero-copy p { max-width:400px; color:#676756; font-size:1.02rem; line-height:1.75; }
    .hero-cta { display:inline-flex; gap:20px; align-items:center; color:var(--leaf-dark); text-decoration:none; font-weight:700; border-bottom:1px solid #a9ae8c; padding:12px 0 8px; margin-top:15px; }
    .hero-cta span { font-size:1.35rem; transition:transform .2s; }.hero-cta:hover span { transform:translateX(5px); }
    .origin-stamp { position:absolute; left:69%; bottom:54px; display:flex; align-items:center; gap:7px; padding:9px; border:1px solid #8b8e6b; border-radius:50%; width:77px; height:77px; transform:rotate(-11deg); color:var(--leaf-dark); }
    .origin-stamp span { font-family:'Fraunces',serif; font-size:1.05rem; font-weight:700; }.origin-stamp small { font-size:.5rem; line-height:1.15; text-transform:uppercase; font-weight:700; }
    .hero-art { height:400px; position:relative; margin:26px 0 25px; overflow:hidden; background:#d8dfc1; border-radius:2px 80px 2px 2px; }
    .sun { position:absolute; width:145px; height:145px; border-radius:50%; top:42px; right:19%; background:#edbd54; }
    .mountain { position:absolute; width:110%; height:220px; bottom:52px; left:-5%; clip-path:polygon(0 70%, 16% 33%, 28% 60%, 46% 4%, 63% 62%, 77% 24%, 100% 70%,100% 100%,0 100%); }
    .mountain-back { background:#92a17b; opacity:.82; transform:translateY(-28px); }
    .mountain-front { background:#526e4b; clip-path:polygon(0 68%,20% 43%,34% 66%,52% 26%,68% 65%,83% 36%,100% 61%,100% 100%,0 100%); }
    .produce-bowl { position:absolute; bottom:47px; left:29%; width:310px; height:128px; border-radius:12px 12px 135px 135px; background:#b95236; box-shadow:inset 0 -16px #953e2d, 0 12px 22px #3b462750; z-index:1; }
    .produce { position:absolute; display:block; border-radius:50%; box-shadow:inset -10px -8px #25251e26; }
    .tomato { width:89px;height:87px; background:#d85d3d; top:-54px;left:54px; }
    .potato { width:100px;height:64px; background:#d8b76e; top:-33px;left:132px; transform:rotate(17deg); }
    .corn { width:54px;height:95px; background:#f0ca55; top:-56px;left:212px; transform:rotate(23deg); border-radius:48%; }
    .berry { width:48px;height:43px; background:#7a544c; top:-31px;left:14px; }
    .leaf { position:absolute; display:block; z-index:2; width:68px;height:26px; background:#69844e; border-radius:100% 0 100% 0; }
    .leaf-one { top:-72px;left:60px;transform:rotate(-24deg); }.leaf-two { top:-76px;left:175px;transform:rotate(26deg); }
    .art-caption { position:absolute; bottom:0; height:46px; width:100%; display:flex; justify-content:space-between; align-items:center; padding:0 18px; color:#f7f0dd; z-index:3; font-size:.7rem; letter-spacing:.04em; }
    .art-caption span { color:#e3c56e; }.art-ribbon { position:absolute; z-index:2; top:24px; left:22px; padding:10px 12px; background:#f4ead2; color:var(--tomato-dark); font-family:'Fraunces',serif; font-size:.95rem; line-height:1; text-align:center; transform:rotate(-8deg); box-shadow:2px 4px 0 #41553c30; }
    .hero-bottom { display:flex; align-items:center; gap:16px; height:50px; color:#777662; font-size:.71rem; letter-spacing:.04em; }
    .hero-line { height:1px; background:#c9c0a7; flex:1; }
    .market-content { padding-top:76px; }
    .section-heading { display:flex; align-items:end; justify-content:space-between; margin-bottom:25px; }
    h2 { font-size:clamp(2.3rem,4vw,3.5rem); line-height:1; letter-spacing:-.05em; margin:12px 0 0; }
    .count-label { color:var(--muted); font-size:.78rem; padding-bottom:4px; }
    .search-row { display:grid; grid-template-columns:1fr 245px auto; gap:10px; padding:14px; background:#ece5d6; margin-bottom:25px; }
    .searchbox { display:flex; align-items:center; height:48px; gap:11px; padding:0 12px; background:#fffaf0; border:1px solid #dbd0bc; }
    .searchbox input { border:0; outline:0; min-width:0; width:100%; background:transparent; color:var(--ink); }
    .search-symbol { width:15px;height:15px;border:1.7px solid #71745f;border-radius:50%;position:relative; flex:none; }.search-symbol::after { content:'';position:absolute;width:6px;height:1.5px;background:#71745f;right:-5px;bottom:-2px;transform:rotate(45deg); }
    .clear-search { border:0;background:none;color:var(--tomato-dark);font-size:.75rem;font-weight:700;cursor:pointer; }
    .category-select select { width:100%; height:48px; border:1px solid #dbd0bc; padding:0 12px; background:#fffaf0; color:#5a5c4d; }
    .search-button { border-radius:2px; }
    .product-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:19px; }
    .product-card { background:#fffaf0; border:1px solid #e3d9c5; min-width:0; animation:rise .42s both; transition:transform .25s, box-shadow .25s; }
    .product-card:hover { transform:translateY(-5px); box-shadow:var(--shadow); }
    .product-visual { position:relative; display:block; aspect-ratio:1.16; overflow:hidden; background:#dfe3cf; }
    .product-visual img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .5s; }.product-card:hover img { transform:scale(1.04); }
    .origin-tag { position:absolute; top:12px; left:12px; background:#f5ecd9; color:#4d6540; padding:6px 9px; font-size:.62rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; }
    .product-details { padding:15px 16px 13px; }
    .product-category { color:var(--tomato-dark); font-size:.64rem; font-weight:700; text-transform:uppercase; letter-spacing:.1em; }
    .product-title { display:block; margin-top:5px; color:var(--ink); text-decoration:none; font-family:'Fraunces',serif; font-size:1.35rem; font-weight:600; line-height:1.18; }
    .product-title:hover { color:var(--tomato-dark); }
    .product-details p { height:39px; overflow:hidden; margin:8px 0 10px; color:#737364; font-size:.76rem; line-height:1.55; }
    .product-buy { display:flex; align-items:center; justify-content:space-between; border-top:1px solid #ebe3d2; padding-top:11px; }
    .product-buy strong { font-size:1rem; font-variant-numeric:tabular-nums; }
    .add-btn { width:35px;height:35px;border:0;border-radius:50%;display:grid;place-items:center;background:var(--leaf);color:#fff;font-size:1.4rem;cursor:pointer;transition:transform .2s,background .2s; }
    .add-btn:hover:not(:disabled) { transform:rotate(90deg); background:var(--tomato); }.add-btn:disabled { opacity:.45;cursor:not-allowed; }
    .stock-label { display:block; color:#888777; font-size:.65rem; margin-top:8px; }
    .produce-fallback { position:absolute;inset:0;display:grid;place-items:center;overflow:hidden;background:#dbe1c9;color:#596f46; }
    .produce-fallback[data-kind="despensa"] { background:#e9d9ac;color:#a14d35; }.produce-fallback[data-kind="lácteos"] { background:#d9e3dd;color:#547069; }.produce-fallback[data-kind="frutas"] { background:#e9d3b6;color:#a74d3b; }
    .fallback-orbit { width:135px;height:135px;border:1px solid currentColor;border-radius:50%;position:absolute;opacity:.44; }
    .fallback-orbit::before,.fallback-orbit::after { content:'';position:absolute;inset:13px;border:1px solid currentColor;border-radius:50%;transform:rotate(60deg) scaleX(.42); }.fallback-orbit::after { transform:rotate(-60deg) scaleX(.42); }
    .fallback-leaf { width:60px;height:78px;border-radius:100% 0 100% 0;background:currentColor;opacity:.78;transform:rotate(-36deg); }
    .fallback-name { position:absolute;bottom:18px;right:20px;font-family:'Fraunces',serif;font-size:1.1rem;font-weight:600; }
    .product-skeleton { aspect-ratio:.72; padding:0; position:relative; }.product-skeleton span { display:block;height:58%;background:#eee6d7; }.product-skeleton i { display:block;height:12px;margin:17px 14px;background:#f3eddf; }.product-skeleton i:last-child { width:55%;margin-top:9px; }
    .empty-state { display:flex;min-height:260px;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:34px;background:#f1eadb;border:1px dashed #cfc4ac; }
    .empty-state h3 { margin:10px 0 5px;font-family:'Fraunces',serif;font-size:1.55rem; }.empty-state p { max-width:440px;color:var(--muted);font-size:.9rem;line-height:1.6;margin:0 0 18px; }.empty-state .btn { margin-top:4px; }
    .empty-mark { display:grid;place-items:center;width:42px;height:42px;border-radius:50%;background:#eed5c4;color:var(--tomato-dark);font-size:1.3rem;font-weight:700; }.empty-mark--leaf { background:#e0e8d6;color:var(--leaf); }
    .market-note { display:flex;align-items:center;gap:14px;padding:21px 0;margin-top:45px;border-top:1px solid var(--line);border-bottom:1px solid var(--line); }
    .note-sun { width:33px;height:33px;border:1px solid var(--maize);border-radius:50%;position:relative;flex:none; }.note-sun::after { content:'';position:absolute;inset:7px;background:var(--maize);border-radius:50%; }
    .market-note p { flex:1;color:#666858;font-size:.82rem;margin:0; }.market-note p b { color:var(--ink); }.market-note a { color:var(--leaf-dark);font-size:.8rem;font-weight:700;text-decoration:none; }.market-note a:hover { text-decoration:underline; }
    .visually-hidden { position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0; }
    @media(max-width:900px) { .hero-grid { grid-template-columns:1fr 1fr; }.hero-copy { padding-left:0; }.hero-art { height:340px; }.produce-bowl { left:18%; transform:scale(.84);transform-origin:bottom left; }.product-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    @media(max-width:600px) { .hero-grid { display:flex;flex-direction:column;align-items:stretch;gap:0; }.hero-copy { padding:42px 0 26px; }.hero-copy p { max-width:330px; }.origin-stamp { left:auto;right:10px;bottom:35px; }.hero-art { margin:0 0 10px;height:285px;border-radius:2px 50px 2px 2px; }.sun { width:105px;height:105px; }.produce-bowl { transform:scale(.7);left:24%;bottom:30px; }.hero-bottom { font-size:.63rem;gap:8px; }.hero-bottom span:last-child { text-align:right; }.market-content { padding-top:51px; }.section-heading { align-items:start; }.count-label { padding-top:20px; }.search-row { grid-template-columns:1fr 1fr; padding:10px; }.searchbox { grid-column:1/-1; }.search-button { min-height:46px; }.product-grid { gap:11px; }.product-details { padding:12px 11px; }.product-title { font-size:1.16rem; }.product-details p { font-size:.72rem; }.product-visual { aspect-ratio:1; }.market-note { flex-wrap:wrap; }.market-note a { margin-left:47px; } }
  `],
})
export class CatalogPage implements OnInit {
  private readonly api = inject(ShopApi);
  private readonly cart = inject(CartStore);
  products: Product[] = [];
  categories: string[] = [];
  query = '';
  category = '';
  loading = true;
  error = '';
  failedImages = new Set<number>();
  ngOnInit(): void { this.loadProducts(); }
  loadProducts(): void {
    this.loading = true; this.error = '';
    this.api.products(this.query, this.category).subscribe({
      next: items => { this.products = items.filter(item => item.active); this.categories = [...new Set([...this.categories, ...items.map(item => item.category)])].sort(); this.loading = false; },
      error: err => { this.error = errorMessage(err); this.loading = false; },
    });
  }
  resetFilters(): void { this.query = ''; this.category = ''; this.loadProducts(); }
  imageFailed(id: number): void { this.failedImages = new Set(this.failedImages).add(id); }
  add(product: Product): void { this.cart.add(product); }
  money(value: number): string { return cop(value); }
  initials(name: string): string { return name.split(/\s+/).slice(0, 2).map(part => part.slice(0, 1)).join('').toUpperCase(); }
  kind(category: string): string { return category.toLocaleLowerCase('es'); }
}

@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="page-wrap detail-page">
      <a routerLink="/" class="back-link"><span aria-hidden="true">←</span> Volver al mercado</a>
      @if (loading) { <div class="detail-loading" aria-busy="true"><div class="skeleton"></div><div><i class="skeleton"></i><i class="skeleton"></i><i class="skeleton"></i></div></div> }
      @else if (error) { <div class="notice notice--error detail-notice"><b>No pudimos cargar este producto.</b><p>{{ error }}</p><button class="btn" type="button" (click)="load()">Intentar de nuevo</button></div> }
      @else if (product) {
        <div class="detail-grid enter">
          <div class="detail-image">
            @if (product.image_url && !imageFailed) { <img [src]="product.image_url" [alt]="product.name" (error)="imageFailed=true"> }
            @else { <div class="detail-fallback"><span>{{ initials(product.name) }}</span><i></i></div> }
            <span class="detail-origin">Selección de origen · Nariño</span>
          </div>
          <article class="detail-copy"><div class="eyebrow">{{ product.category }} <span class="dot-sep">·</span> Cultivado cerca</div><h1 class="serif">{{ product.name }}</h1><p class="detail-description">{{ product.description }}</p>
            <div class="origin-card"><span class="origin-symbol">N</span><div><b>De nuestra tierra</b><small>Producto seleccionado en Pasto y sus alrededores.</small></div></div>
            <div class="detail-price">{{ money(product.price_cop) }} <small>COP</small></div>
            <div class="stock">{{ product.stock > 0 ? product.stock + ' disponibles para tu canasta' : 'Agotado por ahora' }}</div>
            <button class="btn btn--tomato detail-add" type="button" [disabled]="product.stock <= 0" (click)="add()"><span aria-hidden="true">+</span> Agregar a mi canasta</button>
            @if (added) { <p class="added-message" role="status">Agregado a tu canasta. <a routerLink="/cart">Ver canasta →</a></p> }
            <div class="detail-promise"><span>Origen claro</span><span>Compra directa</span><span>Inventario real</span></div>
          </article>
        </div>
      }
    </section>
  `,
  styles: [`
    .detail-page { min-height:520px;padding-top:35px; }
    .back-link { display:inline-flex;gap:9px;align-items:center;color:#626554;text-decoration:none;font-size:.82rem;font-weight:700;margin-bottom:30px; }.back-link:hover { color:var(--tomato-dark); }
    .detail-grid { display:grid;grid-template-columns:1fr .83fr;gap:8%;align-items:center;padding:15px 6% 25px; }
    .detail-image { aspect-ratio:1.04;max-height:510px;position:relative;overflow:hidden;background:#dfe3cf; }.detail-image img { width:100%;height:100%;object-fit:cover; }
    .detail-origin { position:absolute;bottom:18px;left:18px;background:#f9f1dd;color:var(--leaf-dark);padding:9px 12px;font-size:.7rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase; }
    .detail-fallback { width:100%;height:100%;display:grid;place-items:center;background:#e4d3af;color:var(--tomato-dark);font-family:'Fraunces',serif;font-size:6rem;position:relative; }.detail-fallback i { position:absolute;width:50%;height:50%;border:1px solid #a4553970;border-radius:50%; }
    .detail-copy { padding-block:20px; }.dot-sep { color:var(--tomato);padding:0 5px; }
    .detail-copy h1 { font-size:clamp(2.6rem,4.4vw,4.3rem);line-height:.99;letter-spacing:-.055em;margin:18px 0 15px; }
    .detail-description { max-width:500px;color:#676859;line-height:1.8;font-size:.98rem; }
    .origin-card { display:flex;align-items:center;gap:12px;margin:26px 0;padding:14px;background:#eae9d9;border-left:3px solid var(--leaf); }.origin-symbol { width:35px;height:35px;display:grid;place-items:center;border:1px solid #87906f;border-radius:50%;font-family:'Fraunces',serif;color:var(--leaf-dark); }.origin-card b,.origin-card small { display:block; }.origin-card b { font-size:.82rem; }.origin-card small { margin-top:3px;color:#6e705e;font-size:.72rem; }
    .detail-price { font-size:1.85rem;font-weight:700; }.detail-price small { color:#777966;font-size:.7rem;letter-spacing:.09em; }
    .stock { color:#747565;font-size:.76rem;margin:6px 0 17px; }.detail-add { min-width:235px; }.added-message { color:var(--success);font-size:.8rem;font-weight:700;margin:13px 0 0; }.added-message a { color:var(--leaf-dark); }
    .detail-promise { display:flex;gap:16px;margin-top:28px;padding-top:16px;border-top:1px solid var(--line);color:#707260;font-size:.68rem; }.detail-promise span::before { content:'✓';color:var(--leaf);font-weight:700;margin-right:5px; }
    .detail-loading { display:grid;grid-template-columns:1fr .8fr;gap:8%;padding:20px 6%; }.detail-loading>div:first-child { aspect-ratio:1;background:#eee6d7; }.detail-loading>div:last-child { display:grid;align-content:center;gap:16px; }.detail-loading i { display:block;height:22px; }.detail-loading i:first-child { width:60%;height:45px; }.detail-loading i:last-child { width:45%; }.detail-notice { margin:50px auto;max-width:600px; }.detail-notice p { margin:8px 0 16px; }
    @media(max-width:700px) { .detail-grid { grid-template-columns:1fr;gap:10px;padding:0 0 20px; }.detail-image { aspect-ratio:1.15; }.detail-copy { padding:24px 3px; }.detail-promise { justify-content:space-between;gap:5px; }.detail-loading { grid-template-columns:1fr; }.detail-loading>div:first-child { aspect-ratio:1.2; } }
  `],
})
export class ProductDetailPage implements OnInit {
  private readonly api = inject(ShopApi);
  private readonly cart = inject(CartStore);
  private readonly route = inject(ActivatedRoute);
  product: Product | null = null; loading = true; error = ''; imageFailed = false; added = false; private id = 0;
  ngOnInit(): void { this.route.paramMap.subscribe(params => { this.id = Number(params.get('id')); this.load(); }); }
  load(): void {
    if (!this.id) { this.loading = false; this.error = 'El identificador del producto no es válido.'; return; }
    this.loading = true; this.error = ''; this.imageFailed = false;
    this.api.product(this.id).subscribe({ next: product => { this.product = product; this.loading = false; }, error: err => { this.error = errorMessage(err); this.loading = false; } });
  }
  add(): void { if (this.product) { this.cart.add(this.product); this.added = true; } }
  money(amount: number): string { return cop(amount); }
  initials(name: string): string { return name.split(/\s+/).slice(0,2).map(word => word[0]).join('').toUpperCase(); }
}

@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="page-wrap cart-page">
      <div class="eyebrow">Tu selección regional</div><h1 class="serif page-title">Mi <em>canasta.</em></h1>
      @if (!cart.lines().length) {
        <div class="cart-empty"><div class="empty-illustration"><span class="empty-basket"></span><i></i></div><h2 class="serif">Todavía está vacía.</h2><p>Hay sabores de Pasto esperando encontrar su camino a tu mesa.</p><a class="btn btn--tomato" routerLink="/">Ir al mercado</a></div>
      } @else {
        <div class="cart-layout">
          <div class="cart-lines">
            <div class="cart-table-head"><span>Producto</span><span>Precio</span><span>Cantidad</span><span>Total</span></div>
            @for (line of cart.lines(); track line.product.id) {
              <article class="cart-line">
                <div class="cart-product">
                  <div class="mini-image">@if (line.product.image_url) { <img [src]="line.product.image_url" [alt]="line.product.name"> } @else { <span>{{ initials(line.product.name) }}</span> }</div>
                  <div><a [routerLink]="['/products', line.product.id]">{{ line.product.name }}</a><small>{{ line.product.category }}</small><button class="remove-link" type="button" (click)="cart.remove(line.product.id)">Quitar</button></div>
                </div>
                <span class="line-unit">{{ money(line.product.price_cop) }}</span>
                <div class="quantity-control" [attr.aria-label]="'Cantidad de ' + line.product.name"><button type="button" (click)="cart.update(line.product.id, line.quantity-1)" [attr.aria-label]="'Reducir cantidad de ' + line.product.name">−</button><span>{{ line.quantity }}</span><button type="button" [disabled]="line.quantity >= line.product.stock" (click)="cart.update(line.product.id, line.quantity+1)" [attr.aria-label]="'Aumentar cantidad de ' + line.product.name">+</button></div>
                <strong class="line-total">{{ money(line.product.price_cop * line.quantity) }}</strong>
              </article>
            }
            <a class="continue-link" routerLink="/">← Seguir explorando</a>
          </div>
          <aside class="summary-box"><div class="eyebrow">Resumen de compra</div><div class="summary-row"><span>Productos</span><span>{{ money(cart.total()) }}</span></div><div class="summary-row"><span>Entrega</span><span class="delivery-label">A coordinar</span></div><div class="summary-total"><span>Total</span><strong>{{ money(cart.total()) }}</strong></div><p>El valor final de entrega se coordina al confirmar el pedido.</p><a class="btn btn--tomato checkout-btn" routerLink="/checkout">Continuar al pedido <span aria-hidden="true">→</span></a><div class="safe-note">Compra directa con productores locales</div></aside>
        </div>
      }
    </section>
  `,
  styles: [`
    .cart-page { min-height:430px;padding-top:54px; }.page-title { font-size:clamp(2.9rem,5vw,4.2rem);letter-spacing:-.06em;margin:10px 0 34px; }.page-title em { color:var(--tomato);font-weight:500; }
    .cart-layout { display:grid;grid-template-columns:minmax(0,1fr) 335px;gap:45px;align-items:start; }
    .cart-table-head { display:grid;grid-template-columns:1fr 105px 130px 100px;padding:0 10px 12px;border-bottom:1px solid #cfc4ad;color:#737463;font-size:.7rem;text-transform:uppercase;letter-spacing:.1em; }
    .cart-line { display:grid;grid-template-columns:1fr 105px 130px 100px;align-items:center;min-height:122px;padding:14px 10px;border-bottom:1px solid #e0d7c4;gap:5px; }
    .cart-product { display:flex;align-items:center;gap:15px;min-width:0; }.mini-image { width:78px;height:78px;flex:none;display:grid;place-items:center;background:#e3dec9;color:var(--tomato-dark);font-family:'Fraunces',serif;font-size:1.4rem; }.mini-image img { width:100%;height:100%;object-fit:cover; }.cart-product a { display:block;text-decoration:none;font-family:'Fraunces',serif;font-weight:600;font-size:1.1rem; }.cart-product a:hover { color:var(--tomato-dark); }.cart-product small { display:block;color:#777867;font-size:.7rem;margin-top:3px; }.remove-link { display:block;border:0;background:none;padding:0;margin-top:8px;color:#9a4b37;text-decoration:underline;text-underline-offset:2px;font-size:.68rem;cursor:pointer; }
    .line-unit,.line-total { font-size:.83rem; }.line-total { font-variant-numeric:tabular-nums; }
    .quantity-control { display:flex;align-items:center;width:max-content;border:1px solid #d9ceb8;background:#fffaf0;height:34px; }.quantity-control button { width:32px;height:32px;border:0;background:transparent;color:var(--leaf-dark);font-size:1rem;cursor:pointer; }.quantity-control button:disabled { opacity:.35;cursor:not-allowed; }.quantity-control span { min-width:25px;text-align:center;font-size:.8rem;font-weight:700; }
    .continue-link { display:inline-block;margin-top:21px;color:var(--leaf-dark);font-size:.79rem;font-weight:700;text-decoration:none; }.continue-link:hover { text-decoration:underline; }
    .summary-box { padding:24px;background:#eee8d9;border-top:3px solid var(--leaf); }.summary-box .eyebrow { margin-bottom:20px; }.summary-row { display:flex;justify-content:space-between;padding:10px 0;color:#666858;font-size:.82rem;border-bottom:1px solid #d9d0bd; }.delivery-label { color:var(--leaf-dark);font-size:.73rem;font-weight:700; }.summary-total { display:flex;align-items:center;justify-content:space-between;padding:17px 0 10px;font-size:1rem; }.summary-total strong { font-size:1.3rem; }.summary-box p { color:#737463;font-size:.7rem;line-height:1.6;margin:0 0 18px; }.checkout-btn { width:100%;justify-content:space-between;border-radius:2px; }.safe-note { text-align:center;color:#747565;font-size:.65rem;margin-top:14px; }
    .cart-empty { display:flex;flex-direction:column;align-items:center;text-align:center;padding:35px 15px 60px; }.cart-empty h2 { font-size:2rem;margin:18px 0 5px; }.cart-empty p { max-width:370px;color:#737463;line-height:1.6;font-size:.85rem;margin:0 0 20px; }.empty-illustration { width:90px;height:70px;position:relative;border-bottom:2px solid #89916e; }.empty-basket { position:absolute;left:17px;bottom:8px;width:56px;height:37px;border:2px solid #a65238;border-top:0;border-radius:0 0 30px 30px; }.empty-basket::before { content:'';position:absolute;width:35px;height:24px;left:8px;top:-15px;border:2px solid #a65238;border-bottom:0;border-radius:25px 25px 0 0; }.empty-illustration i { position:absolute;width:13px;height:26px;background:#728557;border-radius:100% 0 100% 0;left:39px;top:2px;transform:rotate(-20deg); }
    @media(max-width:900px) { .cart-layout { grid-template-columns:minmax(0,1fr) 290px;gap:22px; }.cart-table-head,.cart-line { grid-template-columns:1fr 80px 103px 80px; }.mini-image { width:62px;height:62px; }.cart-product { gap:10px; }.cart-product a { font-size:1rem; } }
    @media(max-width:680px) { .cart-layout { grid-template-columns:1fr;gap:27px; }.cart-table-head { display:none; }.cart-line { grid-template-columns:1fr auto;gap:10px;position:relative;padding:13px 0; }.cart-product { grid-column:1/-1; }.line-unit { display:none; }.quantity-control { grid-column:1; }.line-total { grid-column:2;grid-row:2;text-align:right; }.summary-box { max-width:none; }.cart-page { padding-top:38px; } }
  `],
})
export class CartPage {
  readonly cart = inject(CartStore);
  money(amount: number): string { return cop(amount); }
  initials(name: string): string { return name.split(/\s+/).slice(0,2).map(word => word[0]).join('').toUpperCase(); }
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="page-wrap checkout-page">
      <a routerLink="/cart" class="back-link">← Volver a mi canasta</a>
      <div class="eyebrow">Un último paso</div><h1 class="serif page-title">Confirmar <em>pedido.</em></h1>
      @if (order) {
        <div class="success-panel enter" role="status"><div class="success-seal" aria-hidden="true">✓</div><div class="eyebrow">Pedido confirmado</div><h2 class="serif">Gracias, {{ order.customer_name }}.</h2><p>Tu pedido <b>#{{ order.id }}</b> fue recibido. Guardamos los detalles para que puedas consultarlos cuando quieras.</p><div class="success-total"><span>Total del pedido</span><strong>{{ money(order.total_cop) }}</strong></div><div class="success-actions"><a routerLink="/orders" [queryParams]="{email:order.customer_email}" class="btn">Ver mis pedidos</a><a routerLink="/" class="text-link">Volver al mercado</a></div></div>
      } @else if (!cart.lines().length) {
        <div class="notice checkout-empty"><b>Tu canasta no tiene productos.</b><p>Agrega productos regionales antes de confirmar un pedido.</p><a class="btn" routerLink="/">Explorar el mercado</a></div>
      } @else {
        <div class="checkout-layout">
          <form class="checkout-form" [formGroup]="form" (ngSubmit)="submit()">
            <div class="form-section-title"><span>01</span><div><b>Datos para tu pedido</b><small>Te enviaremos la información de confirmación a este correo.</small></div></div>
            @if (error) { <div class="notice notice--error" role="alert"><b>No pudimos confirmar todavía.</b><p>{{ error }}</p><small>Tu canasta sigue intacta. Al reintentar conservaremos la misma clave segura del intento.</small></div> }
            <div class="field"><label for="customer-name">Nombre completo</label><input id="customer-name" formControlName="customer_name" autocomplete="name" placeholder="¿A nombre de quién va el pedido?">@if (form.controls.customer_name.touched && form.controls.customer_name.invalid) { <small class="validation">Escribe tu nombre para continuar.</small> }</div>
            <div class="field"><label for="customer-email">Correo electrónico</label><input id="customer-email" type="email" formControlName="customer_email" autocomplete="email" placeholder="nombre@correo.com">@if (form.controls.customer_email.touched && form.controls.customer_email.invalid) { <small class="validation">Ingresa un correo electrónico válido.</small> }</div>
            <div class="checkout-reassurance"><span class="reassurance-icon">N</span><p>Guardamos tu nombre y correo para gestionar y consultar el pedido. Este prototipo no incluye cuentas de usuario ni pagos.</p></div>
            <button class="btn btn--tomato submit-order" type="submit" [disabled]="submitting"><span>{{ submitting ? 'Enviando pedido…' : 'Confirmar pedido' }}</span><span aria-hidden="true">→</span></button>
            @if (submitting) { <div class="loading-row" role="status">Estamos registrando tu pedido de forma segura.</div> }
          </form>
          <aside class="checkout-summary"><div class="eyebrow">Tu canasta</div>@for (line of cart.lines(); track line.product.id) { <div class="checkout-item"><span class="item-qty">{{ line.quantity }}</span><span class="item-name">{{ line.product.name }}</span><strong>{{ money(line.product.price_cop * line.quantity) }}</strong></div> }<div class="checkout-total"><span>Total</span><strong>{{ money(cart.total()) }}</strong></div><p>La entrega se coordinará directamente después de confirmar.</p></aside>
        </div>
      }
    </section>
  `,
  styles: [`
    .checkout-page { min-height:480px;padding-top:36px; }.back-link { display:inline-block;color:#676958;text-decoration:none;font-weight:700;font-size:.79rem;margin-bottom:35px; }.back-link:hover { color:var(--tomato-dark); }
    .page-title { font-size:clamp(2.8rem,5vw,4.2rem);letter-spacing:-.06em;margin:10px 0 33px; }.page-title em { color:var(--tomato);font-weight:500; }
    .checkout-layout { display:grid;grid-template-columns:minmax(0,1fr) 350px;gap:55px;align-items:start; }.checkout-form { display:grid;gap:19px; }.form-section-title { display:flex;align-items:center;gap:13px;padding-bottom:17px;border-bottom:1px solid var(--line); }.form-section-title>span { display:grid;place-items:center;width:33px;height:33px;background:#e2e8d9;color:var(--leaf-dark);border-radius:50%;font-family:'Fraunces',serif; }.form-section-title b,.form-section-title small { display:block; }.form-section-title b { font-size:.95rem; }.form-section-title small { color:#767766;font-size:.73rem;margin-top:4px; }
    .validation { color:var(--danger);font-size:.73rem; }.checkout-reassurance { display:flex;gap:12px;align-items:center;background:#e9eadc;padding:13px; }.reassurance-icon { display:grid;place-items:center;flex:none;width:30px;height:30px;border:1px solid #82906d;border-radius:50%;font-family:'Fraunces',serif;color:var(--leaf); }.checkout-reassurance p { margin:0;color:#656858;font-size:.73rem;line-height:1.55; }.submit-order { width:100%;justify-content:space-between; }.checkout-summary { padding:24px;background:#eee8d9;border-top:3px solid var(--leaf); }.checkout-summary>.eyebrow { margin-bottom:17px; }.checkout-item { display:grid;grid-template-columns:26px 1fr auto;gap:9px;align-items:center;padding:11px 0;border-bottom:1px solid #d9d0bd; }.item-qty { display:grid;place-items:center;width:23px;height:23px;border-radius:50%;background:#dfe6d4;color:var(--leaf-dark);font-weight:700;font-size:.7rem; }.item-name { font-size:.8rem; }.checkout-item strong { font-size:.78rem; }.checkout-total { display:flex;justify-content:space-between;align-items:center;padding:19px 0 11px; }.checkout-total strong { font-size:1.25rem; }.checkout-summary>p { color:#767766;font-size:.7rem;line-height:1.6;margin:0; }.checkout-summary .eyebrow { margin-bottom:6px; }
    .checkout-empty { max-width:620px; }.checkout-empty p { margin:8px 0 15px; }.success-panel { max-width:670px;margin:5px auto 40px;padding:45px 50px;background:#e6ebdc;border-top:4px solid var(--leaf);text-align:center; }.success-seal { display:grid;place-items:center;width:48px;height:48px;border-radius:50%;margin:0 auto 15px;background:var(--leaf);color:white;font-size:1.3rem; }.success-panel h2 { font-size:2.4rem;margin:11px 0; }.success-panel>p { max-width:460px;margin:0 auto;color:#646754;font-size:.87rem;line-height:1.7; }.success-total { display:flex;justify-content:center;gap:20px;margin:25px 0 21px;padding:14px;border-block:1px solid #c9d1bb;color:#626650;font-size:.85rem; }.success-total strong { color:var(--ink); }.success-actions { display:flex;align-items:center;justify-content:center;gap:22px; }.success-actions .btn { border-radius:2px; }
    @media(max-width:760px) { .checkout-layout { grid-template-columns:1fr;gap:24px; }.checkout-summary { order:-1; }.checkout-page { padding-top:28px; }.success-panel { padding:35px 20px; }.success-actions { flex-direction:column;gap:14px; } }
  `],
})
export class CheckoutPage {
  private readonly api = inject(ShopApi);
  readonly cart = inject(CartStore);
  private readonly fb = inject(FormBuilder);
  readonly form = this.fb.nonNullable.group({
    customer_name: ['', [Validators.required, Validators.minLength(2), Validators.pattern(/\S/)]],
    customer_email: ['', [Validators.required, Validators.email]],
  });
  error = ''; submitting = false; order: Order | null = null;
  private readonly keyStorage = 'shoppasto-checkout-idempotency-key';
  private async keyFor(body: CheckoutRequest): Promise<string> {
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const fingerprint = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    let saved: { fingerprint?: string; key?: string } = {};
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(this.keyStorage) ?? '{}');
      if (parsed && typeof parsed === 'object') saved = parsed as typeof saved;
    } catch {
      localStorage.removeItem(this.keyStorage);
    }
    if (saved.fingerprint === fingerprint && saved.key) return saved.key;
    const key = crypto.randomUUID();
    localStorage.setItem(this.keyStorage, JSON.stringify({ fingerprint, key }));
    return key;
  }
  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.submitting || !this.cart.lines().length) return;
    this.submitting = true; this.error = '';
    const value = this.form.getRawValue();
    const body: CheckoutRequest = {
      customer_name: value.customer_name.trim(),
      customer_email: value.customer_email.trim(),
      items: this.cart.lines().map(line => ({ product_id: line.product.id, quantity: line.quantity })),
    };
    try {
      const key = await this.keyFor(body);
      this.api.createOrder(body, key).subscribe({
        next: order => {
          this.order = order; this.submitting = false; this.cart.clear();
          localStorage.removeItem(this.keyStorage);
        },
        error: err => { this.error = errorMessage(err); this.submitting = false; },
      });
    } catch {
      this.error = 'No pudimos guardar una referencia segura para el reintento. Revisa el almacenamiento del navegador e inténtalo de nuevo.';
      this.submitting = false;
    }
  }
  money(amount: number): string { return cop(amount); }
}

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <section class="page-wrap orders-page">
      <div class="eyebrow">Tus compras, a la vista</div><h1 class="serif page-title">Mis <em>pedidos.</em></h1>
      <p class="orders-intro">Consulta el estado de tus pedidos usando el correo que compartiste al comprar.</p>
      <form class="lookup-form" (ngSubmit)="lookup()"><label class="field"><span>Correo electrónico</span><input name="email" type="email" [(ngModel)]="email" required email placeholder="nombre@correo.com" autocomplete="email"></label><button class="btn btn--tomato" [disabled]="loading || !email.trim()">Buscar pedidos <span aria-hidden="true">→</span></button></form>
      @if (error) { <div class="notice notice--error lookup-message" role="alert"><b>No pudimos consultar tus pedidos.</b><p>{{ error }}</p><button class="text-button" type="button" (click)="lookup()">Intentar de nuevo</button></div> }
      @if (loading) { <div class="orders-loading" aria-busy="true"><div class="skeleton"></div><div class="skeleton"></div></div> }
      @else if (searched && !error && orders.length === 0) { <div class="orders-empty"><span class="empty-mark">?</span><h2 class="serif">No hay pedidos con ese correo.</h2><p>Revisa que esté escrito igual que al momento de compra, o conoce lo que hay hoy en el mercado.</p><a routerLink="/" class="text-link">Explorar productos →</a></div> }
      @else if (orders.length > 0) {
        <div class="results-head"><b>{{ orders.length }} {{ orders.length === 1 ? 'pedido encontrado' : 'pedidos encontrados' }}</b><span>{{ email }}</span></div>
        <div class="orders-list">
          @for (order of orders; track order.id) {
            <article class="order-card">
              <div class="order-top"><div><span class="order-id">PEDIDO #{{ order.id }}</span><span class="order-date">{{ date(order.created_at) }}</span></div><span class="status-pill" [attr.data-status]="order.status">{{ statusText(order.status) }}</span></div>
              <div class="order-details"><div><small>Productos</small><b>{{ order.items.length }} {{ order.items.length === 1 ? 'artículo' : 'artículos' }}</b></div><div><small>Total</small><b>{{ money(order.total_cop) }}</b></div><button type="button" class="details-toggle" (click)="toggle(order.id)">{{ expandedId === order.id ? 'Ocultar detalle' : 'Ver detalle' }} <span aria-hidden="true">{{ expandedId === order.id ? '−' : '+' }}</span></button></div>
              @if (expandedId === order.id) {
                @if (detailLoading === order.id) { <div class="loading-row">Cargando detalle del pedido…</div> }
                @else if (detailErrors[order.id]) { <div class="notice notice--error detail-error">{{ detailErrors[order.id] }} <button class="text-button" type="button" (click)="loadDetail(order.id)">Reintentar</button></div> }
                @else if (details[order.id]) { <div class="order-items">@for (item of details[order.id].items; track item.product_id) { <div><span>{{ item.quantity }} × {{ item.product_name }}</span><b>{{ money(item.line_total_cop) }}</b></div> }</div> }
              }
              @if (order.status === 'confirmed') { <div class="order-action"><span>Tu pedido está confirmado y en preparación.</span>@if (cancelConfirmId === order.id) { <span class="cancel-confirm">¿Confirmas la cancelación? <button type="button" class="cancel-button" [disabled]="cancelBusy === order.id" (click)="cancel(order)">{{ cancelBusy === order.id ? 'Cancelando…' : 'Sí, cancelar' }}</button><button type="button" class="keep-button" (click)="cancelConfirmId = ''">Mantener pedido</button></span> } @else { <button type="button" class="cancel-button" (click)="cancelConfirmId = order.id">Cancelar pedido</button> }</div> }
              @if (cancelMessages[order.id]) { <div class="notice" [class.notice--success]="cancelSuccess[order.id]" [class.notice--error]="!cancelSuccess[order.id]" role="status">{{ cancelMessages[order.id] }}</div> }
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .orders-page { min-height:490px;padding-top:55px; }.page-title { font-size:clamp(2.9rem,5vw,4.2rem);letter-spacing:-.06em;margin:10px 0 9px; }.page-title em { color:var(--tomato);font-weight:500; }.orders-intro { color:#6b6d5d;font-size:.9rem;line-height:1.65;max-width:590px;margin:0 0 24px; }
    .lookup-form { display:flex;align-items:end;gap:12px;max-width:650px;padding:15px;background:#eee8d9;border-left:3px solid var(--leaf); }.lookup-form .field { flex:1; }.lookup-form .field span { color:#535547;font-size:.82rem;font-weight:700; }.lookup-form .btn { border-radius:2px; }.lookup-message { max-width:650px;margin-top:18px; }.lookup-message p { margin:6px 0; }
    .results-head { display:flex;justify-content:space-between;align-items:center;margin:33px 0 13px;color:#4a4d3f;font-size:.82rem; }.results-head span { color:#787967;font-size:.72rem; }
    .orders-list { display:grid;gap:13px;max-width:860px; }.order-card { border:1px solid #ded5c2;background:#fffaf0;padding:19px 21px; }.order-top { display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:1px solid #ebe3d2; }.order-id { display:block;font-weight:700;font-size:.76rem;letter-spacing:.08em; }.order-date { display:block;margin-top:5px;color:#777867;font-size:.69rem; }.status-pill { padding:6px 10px;border-radius:30px;font-weight:700;font-size:.67rem;text-transform:uppercase;letter-spacing:.06em;background:#e6ebdc;color:#42613a; }.status-pill[data-status="pending"] { background:#f4e7c5;color:#8c6a19; }.status-pill[data-status="cancelled"] { background:#f0dfd8;color:#93473b; }
    .order-details { display:flex;align-items:center;gap:48px;padding:15px 0; }.order-details div small,.order-details div b { display:block; }.order-details div small { color:#777867;font-size:.67rem;margin-bottom:4px; }.order-details div b { font-size:.83rem; }.details-toggle { margin-left:auto;border:0;background:transparent;color:var(--leaf-dark);font-size:.75rem;font-weight:700;cursor:pointer; }.details-toggle span { margin-left:6px;font-size:1rem; }
    .order-items { border-top:1px solid #e4dbc8;padding:7px 0 12px; }.order-items>div { display:flex;justify-content:space-between;padding:7px 0;color:#666858;font-size:.76rem; }.order-items b { color:var(--ink); }.order-action { display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid #e4dbc8;padding-top:12px;color:#727463;font-size:.72rem; }.cancel-button { border:1px solid #d7c0b2;background:transparent;color:#9a4435;padding:8px 11px;font-weight:700;font-size:.72rem;cursor:pointer; }.cancel-button:hover:not(:disabled) { background:#f3e2dc; }.cancel-button:disabled { opacity:.55;cursor:wait; }
     .detail-error { margin:9px 0; }.text-button { display:block;background:none;border:0;padding:4px 0;color:var(--leaf-dark);text-decoration:underline;font-size:.75rem;font-weight:700;cursor:pointer; }.orders-empty { display:flex;flex-direction:column;align-items:center;text-align:center;max-width:640px;margin:37px 0;padding:30px;background:#f0eadb; }.orders-empty h2 { font-size:1.7rem;margin:13px 0 5px; }.orders-empty p { max-width:400px;color:#727362;font-size:.82rem;line-height:1.6; }.orders-empty .text-link { margin-top:9px;font-size:.8rem; }.cancel-confirm { display:flex;align-items:center;gap:7px;flex-wrap:wrap; }.keep-button { border:0;background:transparent;color:var(--leaf-dark);padding:8px;font-weight:700;font-size:.72rem;cursor:pointer; }
    .orders-loading { max-width:860px;display:grid;gap:12px;margin-top:22px; }.orders-loading .skeleton { height:114px; }.empty-mark { display:grid;place-items:center;width:38px;height:38px;background:#e7e9d9;color:var(--leaf);border-radius:50%;font-family:'Fraunces',serif;font-size:1.2rem; }
    @media(max-width:600px) { .orders-page { padding-top:38px; }.lookup-form { flex-direction:column;align-items:stretch; }.lookup-form .btn { width:100%; }.order-card { padding:15px; }.order-details { gap:17px; }.order-action { align-items:flex-start;flex-direction:column; }.details-toggle { margin-left:auto; }.results-head { align-items:flex-start;gap:5px;flex-direction:column; } }
  `],
})
export class OrdersPage implements OnInit {
  private readonly api = inject(ShopApi);
  private readonly route = inject(ActivatedRoute);
  email = ''; orders: Order[] = []; loading = false; searched = false; error = '';
  expandedId = ''; detailLoading = ''; details: Record<string, Order> = {}; detailErrors: Record<string, string> = {};
  cancelBusy = ''; cancelConfirmId = ''; cancelMessages: Record<string, string> = {}; cancelSuccess: Record<string, boolean> = {};
  ngOnInit(): void {
    const email = this.route.snapshot.queryParamMap.get('email');
    if (email) { this.email = email; this.lookup(); }
  }
  lookup(): void {
    if (!this.email.trim()) return;
    this.loading = true; this.error = ''; this.searched = true; this.orders = [];
    this.api.orders(this.email.trim()).subscribe({
      next: orders => { this.orders = orders; this.loading = false; },
      error: err => { this.error = errorMessage(err); this.loading = false; },
    });
  }
  toggle(id: string): void {
    if (this.expandedId === id) { this.expandedId = ''; return; }
    this.expandedId = id;
    if (!this.details[id]) this.loadDetail(id);
  }
  loadDetail(id: string): void {
    this.detailLoading = id; delete this.detailErrors[id];
    this.api.order(id).subscribe({
      next: order => { this.details = { ...this.details, [id]: order }; this.detailLoading = ''; },
      error: err => { this.detailErrors = { ...this.detailErrors, [id]: errorMessage(err) }; this.detailLoading = ''; },
    });
  }
  cancel(order: Order): void {
    if (this.cancelBusy) return;
    if (this.cancelConfirmId !== order.id) return;
    this.cancelBusy = order.id; delete this.cancelMessages[order.id];
    this.api.cancel(order.id).subscribe({
      next: updated => {
        this.orders = this.orders.map(item => item.id === updated.id ? updated : item);
        this.details = { ...this.details, [updated.id]: updated };
        this.cancelMessages = { ...this.cancelMessages, [order.id]: 'Pedido cancelado. La actualización quedó guardada.' };
        this.cancelSuccess = { ...this.cancelSuccess, [order.id]: true };
        this.cancelBusy = ''; this.cancelConfirmId = '';
      },
      error: err => {
        this.cancelMessages = { ...this.cancelMessages, [order.id]: errorMessage(err) };
        this.cancelSuccess = { ...this.cancelSuccess, [order.id]: false };
        this.cancelBusy = ''; this.cancelConfirmId = '';
      },
    });
  }
  money(amount: number): string { return cop(amount); }
  date(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(date); }
  statusText(status: Order['status']): string { return status === 'confirmed' ? 'Confirmado' : status === 'pending' ? 'Pendiente' : 'Cancelado'; }
}
