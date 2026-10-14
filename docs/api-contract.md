# Contrato HTTP de ShopPasto

La interfaz Angular consume FastAPI mediante HTTP/JSON. FastAPI publica el esquema OpenAPI en `/openapi.json` y Swagger UI en `/docs`. El navegador no se conecta directamente a gRPC.

Base local: `http://localhost:8000/api`.

## Productos

### `GET /products`

Query opcionales: `q` (búsqueda por nombre/descripción) y `category`.

Respuesta `200`: arreglo de productos.

```json
{
  "id": 1,
  "name": "Café de Nariño",
  "description": "Café de altura de origen regional.",
  "category": "Despensa",
  "price_cop": 28000,
  "image_url": "",
  "stock": 12,
  "active": true
}
```

### `GET /products/{product_id}`

Respuesta `200`: producto. `404` si no existe o no está disponible.

## Pedidos

### `POST /orders`

Header obligatorio `Idempotency-Key`: clave única del intento. Reutilizarla con la misma solicitud devuelve el pedido original; usarla con contenido distinto devuelve `409`.

```json
{
  "customer_name": "Cliente de prueba",
  "customer_email": "cliente@example.com",
  "items": [{"product_id": 1, "quantity": 2}]
}
```

Respuesta `201`: pedido con `id`, `status`, `total_cop`, `created_at` y las líneas compradas. El estado de éxito es `confirmed`.

Errores: `400` entrada inválida, `404` producto inexistente, `409` inventario insuficiente o clave idempotente en conflicto, `503` servicio gRPC no disponible y `504` tiempo de espera.

### `GET /orders/{order_id}`

Respuesta `200`: pedido con artículos; `404` si no existe.

### `GET /orders?email={customer_email}`

Lista los pedidos asociados al correo suministrado. Devuelve un arreglo vacío si no hay coincidencias.

**Límite del prototipo:** no hay autenticación ni se valida la propiedad del correo. Esta consulta no es adecuada para pedidos reales en una instancia pública.

### `POST /orders/{order_id}/cancel`

Cancela un pedido confirmado y libera su reserva una sola vez. Devuelve `409` si el estado no admite cancelación.

## Health

### `GET /health`

Devuelve el estado del proceso FastAPI. No implica por sí solo que PostgreSQL o los procesos gRPC estén disponibles.

## Contratos gRPC

Los contratos fuente están en `backend/proto/`. El servicio de pedidos invoca al de inventario por gRPC real. Los errores de negocio se expresan con códigos gRPC y FastAPI los traduce a estados HTTP.
