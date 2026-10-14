from concurrent import futures
from datetime import timezone
import hashlib
import json
import logging
import os
import uuid

import grpc
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

import inventory_pb2
import inventory_pb2_grpc
import orders_pb2
import orders_pb2_grpc
from app.db import SessionLocal
from app.models import Order, OrderItem
from app.order_access import OrderAccessConfigurationError, has_order_access, order_access_token

logger = logging.getLogger("shoppasto.orders")


def order_message(order: Order) -> orders_pb2.Order:
    created = order.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return orders_pb2.Order(
        id=order.id,
        customer_name=order.customer_name,
        customer_email=order.customer_email,
        status=order.status,
        total_cop=order.total_cop,
        created_at=created.isoformat(),
        items=[
            orders_pb2.OrderLine(
                product_id=item.product_id,
                product_name=item.product_name,
                unit_price_cop=item.unit_price_cop,
                quantity=item.quantity,
                line_total_cop=item.line_total_cop,
            )
            for item in order.items
        ],
    )


def load_order(session, order_id: str) -> Order | None:
    return session.scalar(
        select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
    )


def fingerprint(name: str, email: str, items: dict[int, int]) -> str:
    payload = {
        "customer_name": name,
        "customer_email": email,
        "items": [{"product_id": product_id, "quantity": quantity} for product_id, quantity in sorted(items.items())],
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


class OrderServicer(orders_pb2_grpc.OrderServiceServicer):
    def __init__(self) -> None:
        target = os.getenv("INVENTORY_GRPC_TARGET", "inventory:50051")
        self.inventory_channel = grpc.insecure_channel(target)
        self.inventory = inventory_pb2_grpc.InventoryServiceStub(self.inventory_channel)

    def CreateOrder(self, request, context):
        self._require_access_configuration(context)
        name = request.customer_name.strip()
        email = request.customer_email.strip().lower()
        key = request.idempotency_key.strip()
        if not key or len(key) > 120:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, "La clave idempotente es obligatoria.")
        if not name or len(name) > 120 or "@" not in email or len(email) > 254:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, "Los datos del comprador no son válidos.")
        if not request.items:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, "El pedido debe contener al menos un producto.")
        quantities: dict[int, int] = {}
        for item in request.items:
            if item.product_id <= 0 or item.quantity <= 0:
                context.abort(grpc.StatusCode.INVALID_ARGUMENT, "El producto y la cantidad deben ser mayores que cero.")
            if item.product_id in quantities:
                context.abort(grpc.StatusCode.INVALID_ARGUMENT, "No se permiten productos repetidos en el pedido.")
            quantities[item.product_id] = item.quantity

        request_hash = fingerprint(name, email, quantities)
        with SessionLocal() as session:
            order = session.scalar(
                select(Order).options(selectinload(Order.items))
                .where(Order.idempotency_key == key)
                .with_for_update()
            )
            if order and order.request_fingerprint != request_hash:
                context.abort(grpc.StatusCode.ALREADY_EXISTS, "La clave idempotente ya se usó con otros datos.")
            if order and order.status == "confirmed":
                return order_message(order)
            if order and order.status == "cancelled":
                context.abort(grpc.StatusCode.FAILED_PRECONDITION, "Este pedido ya fue cancelado.")

            if order is None:
                products = []
                for product_id in sorted(quantities):
                    try:
                        product = self.inventory.GetProduct(
                            inventory_pb2.GetProductRequest(product_id=product_id), timeout=2.0
                        )
                    except grpc.RpcError as error:
                        context.abort(error.code(), error.details() or "No se pudo consultar el producto.")
                    products.append((product, quantities[product.id]))

                new_id = str(uuid.uuid4())
                order = Order(
                    id=new_id,
                    idempotency_key=key,
                    request_fingerprint=request_hash,
                    customer_name=name,
                    customer_email=email,
                    status="pending",
                    total_cop=sum(product.price_cop * quantity for product, quantity in products),
                    items=[
                        OrderItem(
                            product_id=product.id,
                            product_name=product.name,
                            unit_price_cop=product.price_cop,
                            quantity=quantity,
                            line_total_cop=product.price_cop * quantity,
                        )
                        for product, quantity in products
                    ],
                )
                session.add(order)
                try:
                    session.commit()
                    order = load_order(session, new_id)
                except IntegrityError:
                    session.rollback()
                    order = session.scalar(
                        select(Order).options(selectinload(Order.items))
                        .where(Order.idempotency_key == key)
                        .with_for_update()
                    )
                    if order is None or order.request_fingerprint != request_hash:
                        context.abort(grpc.StatusCode.ABORTED, "No se pudo resolver el reintento del pedido.")
                    if order.status == "confirmed":
                        return order_message(order)

            try:
                self.inventory.ReserveStock(
                    inventory_pb2.ReserveStockRequest(
                        order_id=order.id,
                        items=[
                            inventory_pb2.ReservationItem(product_id=product_id, quantity=quantity)
                            for product_id, quantity in sorted(quantities.items())
                        ],
                    ),
                    timeout=3.0,
                )
            except grpc.RpcError as error:
                if error.code() in {
                    grpc.StatusCode.INVALID_ARGUMENT,
                    grpc.StatusCode.NOT_FOUND,
                    grpc.StatusCode.ALREADY_EXISTS,
                    grpc.StatusCode.ABORTED,
                    grpc.StatusCode.FAILED_PRECONDITION,
                }:
                    order.status = "cancelled"
                    session.commit()
                context.abort(error.code(), error.details() or "No se pudo reservar el inventario.")

            order.status = "confirmed"
            session.commit()
            order = load_order(session, order.id)
            return order_message(order)

    def GetOrder(self, request, context):
        self._require_access_configuration(context)
        with SessionLocal() as session:
            order = load_order(session, request.order_id)
            if order is None or not has_order_access(order.id, request.access_token):
                context.abort(grpc.StatusCode.NOT_FOUND, "El pedido no existe.")
            return order_message(order)

    def ListOrdersByEmail(self, request, context):
        self._require_access_configuration(context)
        if not request.access_token:
            context.abort(grpc.StatusCode.UNAUTHENTICATED, "Se requiere la clave de acceso del pedido.")
        email = request.customer_email.strip().lower()
        with SessionLocal() as session:
            orders = session.scalars(
                select(Order)
                .options(selectinload(Order.items))
                .where(Order.customer_email == email)
                .order_by(Order.created_at.desc())
            ).all()
            authorized_orders = [
                order for order in orders
                if has_order_access(order.id, request.access_token)
            ]
            return orders_pb2.ListOrdersByEmailResponse(
                orders=[order_message(order) for order in authorized_orders]
            )

    def CancelOrder(self, request, context):
        self._require_access_configuration(context)
        with SessionLocal() as session:
            order = session.scalar(
                select(Order).options(selectinload(Order.items))
                .where(Order.id == request.order_id)
                .with_for_update()
            )
            if order is None or not has_order_access(order.id, request.access_token):
                context.abort(grpc.StatusCode.NOT_FOUND, "El pedido no existe.")
            if order.status == "cancelled":
                return order_message(order)
            if order.status != "confirmed":
                context.abort(grpc.StatusCode.FAILED_PRECONDITION, "Solo se pueden cancelar pedidos confirmados.")
            try:
                self.inventory.ReleaseReservation(
                    inventory_pb2.ReleaseReservationRequest(order_id=order.id), timeout=3.0
                )
            except grpc.RpcError as error:
                context.abort(error.code(), error.details() or "No se pudo liberar el inventario.")
            order.status = "cancelled"
            session.commit()
            order = load_order(session, order.id)
            return order_message(order)

    @staticmethod
    def _require_access_configuration(context) -> None:
        try:
            order_access_token("configuration-check")
        except OrderAccessConfigurationError:
            context.abort(
                grpc.StatusCode.UNAVAILABLE,
                "El servicio no tiene configurada una clave segura de acceso a pedidos.",
            )


def serve() -> None:
    port = int(os.getenv("ORDERS_GRPC_PORT", "50052"))
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    orders_pb2_grpc.add_OrderServiceServicer_to_server(OrderServicer(), server)
    server.add_insecure_port(f"[::]:{port}")
    server.start()
    logger.info("Orders gRPC listening on port %s", port)
    server.wait_for_termination()


if __name__ == "__main__":
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    serve()
