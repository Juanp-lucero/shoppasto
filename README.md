# ShopPasto

Tienda web académica para consultar productos regionales, reservar existencias y crear pedidos con servicios independientes que se comunican mediante gRPC.

## Estado

El desarrollo se realiza por etapas en la rama `feature/grpc-ecommerce`. Este primer corte implementa y verifica el recorrido catálogo → carrito → pedido → consulta/cancelación. No incluye pagos ni cuentas de usuario.

## Tecnologías

- Angular 21.2 y TypeScript para el navegador.
- FastAPI, Pydantic, SQLAlchemy y Alembic para la API y persistencia.
- PostgreSQL para productos, existencias, reservas y pedidos.
- Python gRPC y Protocol Buffers para los servicios de inventario y pedidos.
- Docker Compose para ejecutar localmente el conjunto.

## Estructura

- `frontend/`: aplicación Angular.
- `backend/gateway/`: API HTTP y cliente gRPC.
- `backend/services/inventory/`: servidor gRPC de inventario.
- `backend/services/orders/`: servidor gRPC de pedidos.
- `backend/proto/`: contratos fuente Protocol Buffers.
- `backend/migrations/`: migraciones Alembic.
- `backend/tests/`: pruebas automatizadas.
- `docs/`: arquitectura, contrato REST y decisiones del proyecto.

## Iniciar el entorno local

Requiere Docker con Docker Compose.

```bash
cp .env.example .env
docker compose up --build
```

- Tienda Angular: http://localhost:4200
- API FastAPI y OpenAPI: http://localhost:8000/docs
- PostgreSQL: `localhost:5432` (solo para desarrollo local)

Detener los contenedores:

```bash
docker compose down
```

Los datos de PostgreSQL se conservan en un volumen. Para borrar también los datos locales:

```bash
docker compose down -v
```

## Documentación

- Informe académico, objetivos, alcance, requisitos y versiones: `docs/project-report.md`.
- Diagramas y decisiones de arquitectura: `docs/architecture.md`.
- Contratos REST/OpenAPI: `docs/api-contract.md`.
- Comandos y resultados reales de pruebas: `docs/testing.md`.
- Estado y requisitos pendientes para la nube: `docs/deployment.md`.

## Despliegue

La configuración de Docker Compose está pensada para desarrollo y demostración. La guía de `docs/deployment.md` describe los requisitos de red y TLS antes de elegir una plataforma. No se ha realizado un despliegue en la nube.
