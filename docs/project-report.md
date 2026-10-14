# Informe académico: ShopPasto

## Contexto y problema

Productores regionales necesitan una forma sencilla de mostrar sus productos y recibir pedidos sin perder consistencia en las existencias. Una venta concurrente no debe confirmar más unidades de las disponibles. ShopPasto modela ese flujo para un mercado ficticio de Pasto, Nariño, y permite estudiar cómo separar responsabilidades entre servicios.

## Justificación

El caso integra una interfaz web y una API REST con dos procesos independientes que se comunican mediante gRPC real. Permite observar contratos Protocol Buffers, HTTP/2, persistencia relacional, concurrencia, idempotencia, manejo de fallos y pruebas de extremo a extremo en un alcance que puede ejecutarse localmente con Docker Compose.

## Objetivos

### Objetivo general

Diseñar, implementar y verificar una plataforma académica de comercio electrónico que gestione pedidos e inventario con Angular, FastAPI, PostgreSQL y microservicios gRPC.

### Objetivos específicos

1. Construir un catálogo regional con búsqueda, filtros, detalle y carrito en Angular.
2. Exponer operaciones HTTP/REST documentadas para el navegador mediante FastAPI y Pydantic.
3. Definir contratos `.proto` y generar clientes y servidores Python con las herramientas oficiales de gRPC.
4. Separar inventario y pedidos en procesos independientes conectados por gRPC sobre HTTP/2.
5. Persistir productos, existencias, reservas y pedidos en PostgreSQL con SQLAlchemy y Alembic.
6. Evitar sobreventa mediante operaciones transaccionales e idempotencia, y cubrir fallos con pruebas automatizadas.
7. Documentar la ejecución local, los resultados comprobados y las limitaciones de despliegue.

## Alcance y limitaciones

El MVP permite consultar, buscar y filtrar productos; preparar un carrito; enviar un pedido; reservar inventario; repetir solicitudes sin duplicar el pedido; consultar por identificador o correo; y cancelar, liberando existencias. Los datos de catálogo son ficticios y están precargados para la demostración.

No incluye pagos, cuentas, autenticación, autorización administrativa, logística, ni un despliegue en la nube. Los endpoints de consulta de pedidos no verifican que quien conoce un correo o identificador sea su titular. Por tanto, no se deben introducir datos personales reales ni exponer la API públicamente. Consulte `docs/deployment.md` para las condiciones previas a producción.

## Requisitos

### Funcionales

1. Consultar el catálogo y obtener productos individuales.
2. Buscar por texto y filtrar por categoría.
3. Mantener cantidades del carrito y calcular totales en COP.
4. Crear un pedido con artículos, cliente y clave de idempotencia.
5. Verificar y reservar existencias antes de confirmar el pedido.
6. Consultar pedidos por correo e identificador.
7. Cancelar pedidos confirmados y devolver el inventario una sola vez.

### No funcionales

- La interfaz debe ser adaptable y permitir navegar con controles etiquetados y mensajes de estado.
- La API debe validar entradas, documentar REST con OpenAPI y gestionar códigos de error gRPC.
- Las llamadas entre servicios deben usar gRPC convencional sobre HTTP/2 y nombres DNS internos de Compose.
- La reserva debe protegerse contra concurrencia y conservar consistencia en PostgreSQL.
- Los reintentos deben ser idempotentes y los tiempos de espera deben producir errores controlados.
- La ejecución y las pruebas deben poder reproducirse localmente sin servicios externos pagos.

## Tecnologías y versiones fijadas

| Tecnología | Versión usada | Responsabilidad y motivo |
| --- | --- | --- |
| Angular / Angular CLI | 21.2.25 | Interfaz del cliente; requerido por el taller. |
| TypeScript | 5.9.3 | Tipado de componentes y contratos del cliente. |
| RxJS | 7.8.2 | Flujos HTTP y estado asíncrono habituales de Angular. |
| Python | 3.12 (imagen `python:3.12-slim`) | Runtime común de API y microservicios. |
| FastAPI | 0.143.0 | API HTTP/REST y documentación OpenAPI. |
| Pydantic | 2.13.5 | Validación de solicitudes y respuestas. |
| SQLAlchemy / Alembic | 2.1.4 / 1.20.0 | ORM relacional y migraciones. |
| grpcio / grpcio-tools | 1.84.0 / 1.84.0 | Transporte gRPC y generación de código Python desde `.proto`. |
| PostgreSQL | 17.6 (`alpine`) | Persistencia relacional compartida del MVP local. |
| Pytest / Vitest | 9.1.1 / 4.1.11 | Pruebas del backend y del frontend, respectivamente. |
| Docker Compose | Compose v2 | Entorno local reproducible con servicios separados. |

Las versiones directas de Python y JavaScript están fijadas en los archivos de dependencias. PostgreSQL, Python y el resto de componentes están definidos en Compose y sus Dockerfiles. El archivo `frontend/pnpm-lock.yaml` fija el árbol de dependencias de Node.

Se eligió el stack exigido por el taller. No se incorporaron React, otro framework de backend, bases de datos adicionales, colas, cachés, un segundo gateway ni orquestadores. Esas alternativas no son necesarias para demostrar el flujo y aumentarían la complejidad de instalación y defensa académica.

## Arquitectura y comunicación

Los diagramas de componentes y secuencia se encuentran en `docs/architecture.md`.

1. El navegador Angular consume JSON mediante HTTP/REST; no intenta hablar gRPC desde el navegador.
2. FastAPI valida solicitudes y llama al cliente generado correspondiente.
3. El servicio de pedidos registra el pedido en estado pendiente y llama al servicio de inventario por gRPC.
4. Inventario lee o modifica existencias y reservas en PostgreSQL mediante transacciones.
5. Pedidos confirma el pedido tras una reserva exitosa; una regla de negocio fallida cancela la solicitud.
6. La respuesta vuelve por gRPC a FastAPI y luego como JSON al navegador.

Los archivos `.proto` describen métodos y mensajes. `grpcio-tools` genera el código de cliente y servidor durante la construcción de la imagen; no se editan a mano los archivos generados. gRPC emplea HTTP/2 entre procesos, mientras que Angular usa REST/HTTP con FastAPI. Los contratos publicados por FastAPI están en `docs/api-contract.md`.

## Persistencia y consistencia

Se comparte una instancia PostgreSQL para mantener el ejercicio ejecutable sin introducir una base por servicio. Inventario es responsable de productos, existencias, reservas y sus líneas; pedidos es responsable de pedidos y sus artículos. La separación de responsabilidades no equivale a aislamiento físico de bases de datos.

Las reservas descuentan existencias con transacciones y bloqueos de fila; la clave del pedido hace idempotente la reserva. No existe una transacción distribuida entre servicios: un fallo intermedio puede dejar un pedido pendiente, que puede reintentarse con la misma clave. No se afirma atomicidad global instantánea ni se incluye un proceso de reconciliación automática para producción.

## Decisiones, riesgos y despliegue

- FastAPI cumple la función de entrada HTTP y cliente gRPC; no se añade un servicio de gateway adicional.
- La API REST es pública en el entorno local de demostración. Sin autenticación, consultar pedidos no prueba propiedad del recurso.
- Compose es una configuración local; no contiene TLS para llamadas gRPC. Una nube futura debe mantener gRPC privado o habilitar TLS/mTLS, terminar TLS en el acceso web, gestionar secretos fuera del repositorio y proteger PostgreSQL en una red privada.
- No se eligió una plataforma, región o cuenta cloud ni se estimaron costos porque no hay autorización ni plataforma definida. No se ha desplegado ni verificado el sistema en la nube.
- La advertencia de privacidad y el plan de requisitos de nube están detallados en `docs/deployment.md`.

Los comandos y resultados reales de la compilación, pruebas automatizadas y smoke test están en `docs/testing.md`.
