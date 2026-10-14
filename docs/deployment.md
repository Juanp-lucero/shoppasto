# Estrategia de despliegue (pendiente)

No se ha publicado ni desplegado ShopPasto. `docker-compose.yml` es para desarrollo local y no debe tomarse como una configuración de producción.

El prototipo no implementa autenticación: consultar por correo o por identificador no demuestra que quien hace la consulta sea el titular. No expongas esta API con datos personales reales hasta incorporar y probar controles de acceso.

Antes de elegir una plataforma hay que verificar que permita:

- ejecutar contenedores persistentes para Angular, FastAPI y ambos servidores gRPC;
- mantener HTTP/2 entre FastAPI, Orders e Inventory, idealmente dentro de una red privada;
- ofrecer PostgreSQL administrado o una instancia privada con copias de seguridad;
- gestionar secretos sin guardarlos en el repositorio;
- terminar TLS para tráfico externo y configurar TLS/mTLS interno si la red no es privada.

Un proxy HTTP que solo exponga REST no basta para los servidores gRPC convencionales. Deben comprobarse compatibilidad de HTTP/2, puertos y límites de conexión de la plataforma elegida. Costos, región y aprovisionamiento se evaluarán después de seleccionar una cuenta y plataforma; no se ha creado infraestructura paga.
