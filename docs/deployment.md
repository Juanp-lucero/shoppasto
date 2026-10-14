# Despliegue: tienda Angular en Vercel y backend en Render

La tienda puede publicarse en Vercel como una demo visual sin backend. Esa versión usa productos y precios de muestra, muestra un aviso permanente y bloquea pedidos y consultas de pedidos. No es una tienda lista para aceptar compras reales.

## Importar la demo en Vercel

En el importador del repositorio, elige **Import single project** junto a `frontend` (Angular), no el proyecto agrupado `Services` ni el proyecto `backend`. Usa `frontend` como raíz del proyecto. `frontend/vercel.json` ejecuta `pnpm build:vercel:demo`, publica la salida estática y configura las rutas del Angular Router. La demo no necesita `SHOPPASTO_API_BASE_URL`.

## Crear el backend en Render

El archivo `render.yaml` crea una instancia web para FastAPI y una base PostgreSQL privada. En esa instancia, Inventory y Orders arrancan como procesos internos y se comunican por gRPC en `127.0.0.1`; los puertos gRPC no se exponen como URL pública. La entrada de Render espera PostgreSQL, aplica migraciones, siembra los productos iniciales y después inicia los tres procesos.

En Render:

1. Abre el proyecto Render y elige **New > Blueprint**.
2. Conecta el repositorio y la rama que usa la tienda de Vercel. Render detecta `render.yaml`.
3. Antes de aplicar, revisa el costo del plan de PostgreSQL. El blueprint usa el plan persistente mínimo (`0.1c-256mb`); Render muestra el precio actual antes de crear los recursos. La instancia web está en el nivel gratuito y puede dormir cuando no recibe tráfico.
4. Cuando Render solicite `CORS_ALLOWED_ORIGINS`, pega el origen de producción de Vercel, sin ruta ni barra final, por ejemplo `https://shoppasto.vercel.app`. Usa el dominio estable de producción, no una URL de preview.
5. Confirma la creación y espera a que `shoppasto-api` quede Live. Copia su URL HTTPS, por ejemplo `https://shoppasto-api.onrender.com`.

No cambies la URL pública de Vercel. Esa URL sigue siendo la tienda; Render solo aloja la API que consume por HTTPS.

## Conectar la tienda de Vercel a Render

Después de que Render muestre la URL real de `shoppasto-api`:

1. En Vercel, abre el proyecto actual de la tienda y agrega la variable `SHOPPASTO_API_BASE_URL` para **Production** con la URL real terminada en `/api`, por ejemplo `https://shoppasto-api.onrender.com/api`. No uses el ejemplo literal.
2. No cambies solo el Build Command en el panel: `frontend/vercel.json` fija el comando de demo y tiene prioridad sobre el ajuste general de Vercel. Cuando la API esté Live y la variable ya exista, cambia ese archivo a `pnpm build:vercel` y despliega la rama `feature/grpc-ecommerce`.
3. Vercel actualizará el proyecto existente; no crees otro. El dominio público de la tienda permanece igual y el catálogo, inventario y pedidos pasan a consultar la API.

El origen que pongas en `CORS_ALLOWED_ORIGINS` debe coincidir exactamente con el dominio de producción de Vercel y no incluir `/api`. No uses `*`. Las llamadas desde URLs de preview no estarán permitidas a menos que se agreguen explícitamente.

## Entorno y persistencia

- `SESSION_SECRET` se genera automáticamente por Render. No lo cambies después de aceptar pedidos: eso invalida las claves privadas de acceso a pedidos existentes.
- El backend normaliza la URL de PostgreSQL de Render al dialecto `psycopg` que utiliza SQLAlchemy.
- No publiques ni compartas los valores de `DATABASE_URL` o `SESSION_SECRET`.
- El nivel gratuito de la API puede dormir entre visitas, así que la primera solicitud podría tardar más. La base de datos se configuró en un plan persistente; revisa el precio actual de Render antes de aplicar el Blueprint.

El sistema permite crear, consultar con clave privada y cancelar pedidos, y reserva inventario. No procesa pagos en línea: antes de vender con tarjeta hay que integrar un proveedor de pagos.

## Protección antes de pedidos reales

La consulta y cancelación de pedidos requieren la clave de acceso secreta devuelta al crear cada pedido. La API la valida en el servicio de pedidos y no acepta como prueba el correo ni el identificador público. La tienda conserva la clave en el navegador usado al comprar; quien consulte desde otro dispositivo debe conservar e ingresar esa clave. No la compartas: permite ver los datos del pedido y solicitar su cancelación. Los pedidos creados antes de activar esta protección no tienen clave y no se pueden consultar ni cancelar por la API.
