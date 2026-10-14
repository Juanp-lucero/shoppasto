# Despliegue: Vercel para Angular, backend externo

La ruta acordada es publicar la tienda Angular en Vercel y conservar FastAPI, Orders, Inventory y PostgreSQL en un proveedor externo compatible con contenedores y gRPC sobre HTTP/2. No se ha publicado ni creado infraestructura externa.

## Importar la tienda en Vercel

En el importador del repositorio, elige **Import single project** junto a `frontend` (Angular), no el proyecto agrupado `Services` ni el proyecto `backend`. Usa `frontend` como raíz del proyecto. `frontend/vercel.json` configura el build de producción, la salida estática y las rutas del Angular Router.

Antes del build configura esta variable de entorno en Vercel:

- `SHOPPASTO_API_BASE_URL`: URL HTTPS completa de la API, terminada en `/api` (por ejemplo, `https://api.example.com/api`). No es una credencial. El build falla explícitamente si falta o no tiene ese formato.

## Configurar el backend externo

- Despliega `postgres`, `migrate`, `inventory`, `orders` y `api` desde `docker-compose.yml` en un proveedor que permita mantener la comunicación gRPC/HTTP/2 privada.
- Usa PostgreSQL persistente con copias de seguridad y credenciales de producción gestionadas como secretos. Los valores locales predeterminados del Compose no son para producción.
- Configura `CORS_ALLOWED_ORIGINS` en el backend con el origen exacto de la tienda Vercel, por ejemplo `https://shop.example.com`. Se acepta una lista separada por comas; no se permite `*`.
- Conserva el backend detrás de HTTPS y mantén privados los puertos gRPC.

El proveedor del backend, su dominio público, la base de datos de producción y sus secretos aún no se han elegido. Por eso todavía no se puede probar la conexión entre la tienda publicada y la API.

## Bloqueo antes de usar datos reales

El prototipo no implementa autenticación: consultar un pedido por correo o identificador no demuestra que quien lo consulta sea su titular. No expongas la API con datos personales reales hasta incorporar y probar controles de acceso.
