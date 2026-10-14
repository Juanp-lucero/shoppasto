# Pruebas locales

## Angular

Desde la raíz del repositorio:

```bash
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend build
pnpm --dir frontend test
```

## Backend, PostgreSQL y gRPC

Docker Compose inicia PostgreSQL y aplica la migración antes de ejecutar la suite:

```bash
docker compose run --build --rm -T test
```

El servicio de pruebas usa la base local del Compose. La suite levanta servidores gRPC reales en puertos efímeros para comprobar reservas, concurrencia, idempotencia, cancelación, errores de stock y tiempos de espera. Los registros temporales de prueba se eliminan al terminar cada caso.

## Recorrido HTTP de extremo a extremo

Inicia los servicios con `docker compose up --build`, abre `http://localhost:4200` y completa el pedido desde el catálogo. FastAPI publica Swagger UI en `http://localhost:8000/docs`. El flujo de compra no procesa pagos ni requiere cuentas de usuario.

## Clientes gRPC

El Dockerfile del backend genera los módulos Python desde `backend/proto/` durante la construcción de la imagen. Para generarlos fuera de Docker, instala primero `backend/requirements.txt` en Python 3.12 y ejecuta:

```bash
sh backend/proto/generate.sh
```
