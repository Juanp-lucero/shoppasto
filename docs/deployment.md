# Despliegue: demo Angular en Vercel, backend externo opcional

La tienda puede publicarse en Vercel como una demo visual sin backend. Esa versión usa productos y precios de muestra, muestra un aviso permanente y bloquea pedidos y consultas de pedidos. No es una tienda lista para aceptar compras reales.

## Importar la demo en Vercel

En el importador del repositorio, elige **Import single project** junto a `frontend` (Angular), no el proyecto agrupado `Services` ni el proyecto `backend`. Usa `frontend` como raíz del proyecto. `frontend/vercel.json` ejecuta `pnpm build:vercel:demo`, publica la salida estática y configura las rutas del Angular Router. La demo no necesita `SHOPPASTO_API_BASE_URL`.

## Activar una tienda conectada a un backend

Cuando exista un backend público, cambia el build de Vercel a `pnpm build:vercel` y configura `SHOPPASTO_API_BASE_URL` con la URL HTTPS de la API, terminada en `/api`. El build falla explícitamente si falta o no tiene el formato esperado.

El backend debe:

- Ejecutar FastAPI, Orders, Inventory y PostgreSQL en un proveedor compatible con contenedores y gRPC privado sobre HTTP/2.
- Usar PostgreSQL persistente con copias de seguridad y credenciales gestionadas como secretos. Los valores locales predeterminados de `docker-compose.yml` no son para producción.
- Configurar `CORS_ALLOWED_ORIGINS` con el origen exacto de la tienda Vercel, sin `/api`; se acepta una lista separada por comas y no se permite `*`.
- Exponer la API por HTTPS y mantener privados los puertos gRPC.

## Protección antes de pedidos reales

La aplicación no implementa autenticación: consultar un pedido por correo o identificador no demuestra que quien lo consulta sea su titular. No conectes datos personales ni aceptes pedidos reales hasta incorporar y probar controles de acceso.
