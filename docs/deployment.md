# Despliegue: Vercel, Render y Neon

La tienda conserva su URL pública de Vercel. Render sirve FastAPI y mantiene Orders e Inventory como procesos internos que se comunican por gRPC; Neon proporciona PostgreSQL. La demo actual puede seguir publicada mientras se prepara el backend.

## Crear la base de datos gratuita en Neon

1. Crea un proyecto PostgreSQL en Neon con el plan Free y elige una región de EE. UU. cercana a Ohio si está disponible.
2. En **Connection Details**, selecciona la conexión pooled (host que incluye `-pooler`) y copia la cadena de conexión con TLS, normalmente marcada `sslmode=require`.
3. Guarda esa cadena como contraseña: la vas a pegar directamente en Render como `DATABASE_URL`. No la pongas en GitHub ni la envíes por el chat.

El plan gratuito de Neon no tiene cuota mensual ni requiere tarjeta, pero tiene límites y puede suspender el cómputo por inactividad o al alcanzar la cuota. La primera conexión tras inactividad puede tardar más.

## Crear el backend en Render

El archivo `render.yaml` crea únicamente la instancia web gratuita `shoppasto-api`; ya no crea una base PostgreSQL pagada en Render. FastAPI se expone por HTTPS y Orders e Inventory corren dentro de la misma instancia por gRPC, sin una URL pública propia. El arranque espera a PostgreSQL, aplica migraciones, siembra los productos iniciales y luego inicia los tres procesos.

En Render:

1. Cierra el aviso de pago con **Cancel** si todavía está abierto. El Blueprint actualizado no crea una base pagada de Render.
2. Abre el proyecto `shoppasto` y elige **New > Blueprint**. Conecta `Juanp-lucero/shoppasto`, rama `feature/grpc-ecommerce`; Render detecta `render.yaml`.
3. Cuando Render pida `DATABASE_URL`, pega la cadena pooled de Neon directamente en ese campo secreto.
4. Cuando pida `CORS_ALLOWED_ORIGINS`, pega el origen exacto de producción de Vercel, sin ruta ni barra final, por ejemplo `https://shoppasto.vercel.app`. No uses una URL de preview.
5. `SESSION_SECRET` se genera automáticamente. Revisa que no se esté creando un PostgreSQL pagado de Render y aplica el Blueprint.
6. Espera a que `shoppasto-api` quede **Live** y copia su URL HTTPS.

Si Render vuelve a pedir una tarjeta después de importar este Blueprint sin una base pagada, no la ingreses todavía: cancela y comparte una captura de ese aviso sin datos privados. Puede ser una verificación de cuenta aparte del costo de la base.

## Conectar la tienda de Vercel a Render

Después de que `shoppasto-api` esté **Live**:

1. En el proyecto de Vercel que ya tienes, agrega `SHOPPASTO_API_BASE_URL` para **Production**, con la URL real de Render terminada en `/api` (por ejemplo, `https://<host-real>.onrender.com/api`).
2. Confirma que el build de producción use `pnpm build:vercel`, no `pnpm build:vercel:demo`. Si el `frontend/vercel.json` de la rama de producción aún indica el modo demo, cámbialo después de guardar la variable; ese archivo prevalece sobre el ajuste del panel. Sin la variable, la compilación real falla.
3. Vuelve a desplegar el proyecto existente. No crees otro proyecto ni cambies el dominio de Vercel.

El valor de `CORS_ALLOWED_ORIGINS` en Render debe coincidir exactamente con el dominio de producción de Vercel y no incluir `/api`. No uses `*`. Los despliegues de preview no estarán autorizados salvo que se agreguen explícitamente.

## Entorno y límites

- `DATABASE_URL` es la cadena secreta de Neon. El backend la adapta al dialecto `psycopg` de SQLAlchemy y verifica las conexiones para recuperarse cuando Neon despierta después de inactividad.
- `SESSION_SECRET` se genera automáticamente por Render. No lo cambies después de aceptar pedidos: eso invalida las claves privadas de acceso a pedidos existentes.
- No publiques ni compartas `DATABASE_URL` ni `SESSION_SECRET`.
- Render Free puede dormir entre visitas y Neon Free puede dormir por inactividad; la primera solicitud tras una pausa puede tardar más. Respeta los límites de uso gratuitos de Neon.

El sistema permite cargar catálogo e inventario desde PostgreSQL, crear pedidos, consultarlos con una clave privada y cancelarlos, liberando el stock. No procesa pagos en línea: para cobrar con tarjeta hace falta integrar un proveedor de pagos.


## Verificar pedidos de extremo a extremo

Antes de abrir ventas, completa una compra de prueba desde la tienda publicada y comprueba que:

1. Los productos y el stock vienen de la base de datos, no de `demo-products.ts`.
2. El checkout crea un pedido confirmado y muestra su clave de acceso.
3. El pedido aparece en «Mis pedidos» al usar la clave.
4. Cancelarlo libera la reserva y aumenta el stock de nuevo.
5. Una cantidad superior al stock disponible se rechaza sin crear un pedido.

El conjunto local de pruebas que levanta servicios gRPC reales y usa PostgreSQL se puede ejecutar con `docker compose --profile test run --rm test`.


## Acceso a pedidos

La consulta y cancelación requieren la clave secreta devuelta al crear cada pedido. La API la valida en el servicio Orders y no acepta el correo ni el identificador público como prueba. La tienda conserva la clave en el navegador usado al comprar; para consultar desde otro dispositivo, hay que guardar e ingresar la clave. No la compartas: permite ver los datos del pedido y solicitar su cancelación.

## Alternativa: desplegar en un host con Docker Compose

En lugar del Blueprint de Render, puedes desplegar `docker-compose.yml` en un host que admita Docker Compose y gRPC sobre HTTP/2. El stack incluye PostgreSQL, la migración y carga inicial, Inventory, Orders y FastAPI. Los servicios se comunican por la red privada de Compose:

- FastAPI usa `inventory:50051` y `orders:50052`.
- Orders usa `inventory:50051`.
- Los puertos gRPC solo usan `expose`; no publiques `50051` ni `50052` en Internet.
- PostgreSQL solo se publica en `127.0.0.1`; no abras el puerto `5432` al público.
- FastAPI está disponible como `api:8000` en la red privada de Compose y el puerto del host solo se enlaza a `127.0.0.1:8000`. Configura el ingreso HTTP del proveedor hacia `api:8000`, o un proxy inverso en el host hacia `127.0.0.1:8000`; termina TLS en ese ingreso y acepta tráfico público únicamente por HTTPS.

Usa PostgreSQL persistente, copias de seguridad y un gestor de secretos. Antes de iniciar el stack, configura al menos:

- `POSTGRES_PASSWORD`: contraseña fuerte para PostgreSQL (los valores de Compose por defecto son solo para desarrollo local).
- `SESSION_SECRET`: secreto aleatorio de al menos 32 bytes. Usa el mismo valor para FastAPI y Orders, y mantenlo estable; cambiarlo invalida las claves de acceso de pedidos ya emitidas.
- `CORS_ALLOWED_ORIGINS`: origen exacto de la tienda Vercel, por ejemplo `https://tienda.example.com`, sin `/api`. Se admiten varios orígenes separados por comas; no uses `*`.

El servicio `migrate` ejecuta Alembic y carga el catálogo inicial solo si la tabla de productos está vacía. Revisa y actualiza esos productos y cantidades para que representen la oferta real antes de anunciar la tienda. La base de datos debe conservar sus datos y su volumen entre reinicios y despliegues.

Verifica el backend antes de conectarlo a Vercel:

```sh
curl --fail https://api.example.com/api/health
curl --fail https://api.example.com/api/products
```

La primera respuesta debe indicar `{"status":"ok"}`; la segunda debe mostrar el catálogo leído del servicio Inventory y de PostgreSQL. Prueba también una compra con un producto de prueba, confirma que el stock disminuye y cancela el pedido para confirmar que se repone.


## Conectar Vercel con la API de Docker Compose

Importa `frontend` como raíz del proyecto Angular (no `backend` ni el proyecto agrupado `Services`). En los ajustes de compilación de Vercel, deja que `frontend/vercel.json` use el comando `pnpm build:vercel`, y define `SHOPPASTO_API_BASE_URL` en los entornos de Vercel que vayas a desplegar:

```text
https://api.example.com/api
```

Usa el dominio HTTPS público real de FastAPI, sin barra final, parámetros ni fragmento. Configura el mismo origen público de la tienda en `CORS_ALLOWED_ORIGINS`, vuelve a desplegar el frontend y confirma que el catálogo que aparece coincide con `/api/products`. El navegador hace las solicitudes directamente a la API; por eso el origen de la tienda debe estar permitido por CORS.
