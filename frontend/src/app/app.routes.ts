import { Routes } from '@angular/router';
import { CatalogPage, CartPage, CheckoutPage, OrdersPage, ProductDetailPage } from './shop.pages';

export const routes: Routes = [
  { path: '', component: CatalogPage, title: 'ShopPasto — Mercado local de Pasto' },
  { path: 'products/:id', component: ProductDetailPage, title: 'Producto — ShopPasto' },
  { path: 'cart', component: CartPage, title: 'Mi canasta — ShopPasto' },
  { path: 'checkout', component: CheckoutPage, title: 'Confirmar pedido — ShopPasto' },
  { path: 'orders', component: OrdersPage, title: 'Mis pedidos — ShopPasto' },
  { path: '**', redirectTo: '' },
];
