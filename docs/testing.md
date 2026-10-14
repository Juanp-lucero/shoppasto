# Pruebas locales

## Resultados ejecutados

Verificación realizada el 13 de octubre de 2026 (hora de Colombia):

| Comprobación | Resultado |
| --- | --- |
| `pnpm --dir frontend build` | Correcta; paquete inicial de 374,90 kB sin comprimir (92,65 kB estimados transferidos). |
| `pnpm --dir frontend test` | 6 pruebas aprobadas en 3 archivos. |
| `docker compose run --build --rm -T test` | 12 pruebas aprobadas en 4,05 s, con 1 advertencia de deprecación de Starlette no bloqueante. |
| `docker compose config --quiet` | Correcta. |
| Smoke test HTTP en Compose | Correcto: frontend y proxy `/api` respondieron; se consultó el catálogo, se creó y reintentó un pedido con la misma clave, se consultó y canceló, y se comprobó la restauración del inventario. |

La suite del backend cubre validación, producto inexistente, stock insuficiente, concurrencia sobre las últimas unidades, servicio gRPC no disponible, timeout, idempotencia, errores REST, consulta y cancelación. La suite Angular cubre operaciones de carrito, integración del servicio HTTP y estados de carga/error del catálogo.

La advertencia de Starlette se refiere al cliente `httpx` usado por `TestClient`; no afecta los resultados. No se añadió otra dependencia de pruebas porque el alcance tecnológico restringe herramientas adicionales. No se configuró un linter o formateador externo.

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

La comprobación HTTP automatizada usa `TestClient` contra FastAPI y dos servidores gRPC reales, con PostgreSQL del Compose.

## Recorrido HTTP de extremo a extremo

Inicia los servicios con `docker compose up --build`, abre `http://localhost:4200` y completa el pedido desde el catálogo. FastAPI publica Swagger UI en `http://localhost:8000/docs`. El flujo de compra no procesa pagos ni requiere cuentas de usuario.

## Clientes gRPC

El Dockerfile del backend genera los módulos Python desde `backend/proto/` durante la construcción de la imagen. Para generarlos fuera de Docker, instala primero `backend/requirements.txt` en Python 3.12 y ejecuta:

```bash
sh backend/proto/generate.sh
```
