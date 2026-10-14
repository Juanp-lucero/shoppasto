from concurrent import futures
import logging
import os

import grpc
from sqlalchemy import select
from sqlalchemy.orm import selectinload

import inventory_pb2
import inventory_pb2_grpc
from app.db import SessionLocal
from app.models import Product, Reservation, ReservationItem

logger = logging.getLogger("shoppasto.inventory")

class InventoryRuleError(Exception):
    def __init__(self, code: grpc.StatusCode, message: str):
        super().__init__(message)
        self.code = code


def product_message(product: Product) -> inventory_pb2.Product:
    return inventory_pb2.Product(
        id=product.id,
        name=product.name,
        description=product.description,
        category=product.category,
        price_cop=product.price_cop,
        image_url=product.image_url,
        stock=product.stock,
        active=product.active,
    )


def normalized_items(items) -> dict[int, int]:
    if not items:
        raise ValueError("El pedido debe contener al menos un producto.")
    values: dict[int, int] = {}
    for item in items:
        if item.product_id <= 0 or item.quantity <= 0:
            raise ValueError("El producto y la cantidad deben ser mayores que cero.")
        if item.product_id in values:
            raise ValueError("No se permiten productos repetidos en la reserva.")
        values[item.product_id] = item.quantity
    return values


class InventoryServicer(inventory_pb2_grpc.InventoryServiceServicer):
    def ListProducts(self, request, context):
        with SessionLocal() as session:
            query = select(Product).where(Product.active.is_(True)).order_by(Product.category, Product.name)
            if request.category:
                query = query.where(Product.category == request.category)
            return inventory_pb2.ListProductsResponse(products=[product_message(p) for p in session.scalars(query)])

    def GetProduct(self, request, context):
        if request.product_id <= 0:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, "El identificador del producto no es válido.")
        with SessionLocal() as session:
            product = session.scalar(select(Product).where(Product.id == request.product_id, Product.active.is_(True)))
            if product is None:
                context.abort(grpc.StatusCode.NOT_FOUND, "El producto no existe o no está disponible.")
            return product_message(product)

    def CheckAvailability(self, request, context):
        try:
            quantities = normalized_items(request.items)
        except ValueError as error:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(error))
        with SessionLocal() as session:
            products = session.scalars(
                select(Product).where(Product.id.in_(quantities), Product.active.is_(True))
            ).all()
            by_id = {product.id: product for product in products}
            for product_id, quantity in quantities.items():
                product = by_id.get(product_id)
                if product is None:
                    context.abort(grpc.StatusCode.NOT_FOUND, f"El producto {product_id} no existe o no está disponible.")
                if product.stock < quantity:
                    return inventory_pb2.AvailabilityResponse(
                        available=False,
                        message=f"No hay existencias suficientes de {product.name}.",
                    )
        return inventory_pb2.AvailabilityResponse(available=True, message="Existencias disponibles.")

    def ReserveStock(self, request, context):
        if not request.order_id:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, "El identificador del pedido es obligatorio.")
        try:
            quantities = normalized_items(request.items)
        except ValueError as error:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(error))

        try:
            with SessionLocal.begin() as session:
                existing = session.scalar(
                    select(Reservation)
                    .options(selectinload(Reservation.items))
                    .where(Reservation.id == request.order_id)
                    .with_for_update()
                )
                if existing:
                    prior = {item.product_id: item.quantity for item in existing.items}
                    if prior != quantities:
                        raise InventoryRuleError(
                            grpc.StatusCode.ALREADY_EXISTS,
                            "El pedido ya tiene una reserva diferente.",
                        )
                    if existing.status == "released":
                        raise InventoryRuleError(
                            grpc.StatusCode.FAILED_PRECONDITION,
                            "La reserva ya fue liberada.",
                        )
                    response = inventory_pb2.ReservationResponse(order_id=existing.id, status=existing.status)
                else:
                    products = session.scalars(
                        select(Product)
                        .where(Product.id.in_(sorted(quantities)), Product.active.is_(True))
                        .order_by(Product.id)
                        .with_for_update()
                    ).all()
                    by_id = {product.id: product for product in products}
                    # Another request with the same order id can pass the first
                    # lookup before this one, then wait on these product locks.
                    # Recheck under those locks so an idempotent retry does not
                    # appear to be a second buyer of the same units.
                    existing = session.scalar(
                        select(Reservation)
                        .options(selectinload(Reservation.items))
                        .where(Reservation.id == request.order_id)
                        .with_for_update()
                    )
                    if existing:
                        prior = {item.product_id: item.quantity for item in existing.items}
                        if prior != quantities:
                            raise InventoryRuleError(
                                grpc.StatusCode.ALREADY_EXISTS,
                                "El pedido ya tiene una reserva diferente.",
                            )
                        if existing.status == "released":
                            raise InventoryRuleError(
                                grpc.StatusCode.FAILED_PRECONDITION,
                                "La reserva ya fue liberada.",
                            )
                        response = inventory_pb2.ReservationResponse(order_id=existing.id, status=existing.status)
                        return response
                    for product_id, quantity in quantities.items():
                        product = by_id.get(product_id)
                        if product is None:
                            raise InventoryRuleError(
                                grpc.StatusCode.NOT_FOUND,
                                f"El producto {product_id} no existe o no está disponible.",
                            )
                        if product.stock < quantity:
                            raise InventoryRuleError(
                                grpc.StatusCode.FAILED_PRECONDITION,
                                f"No hay existencias suficientes de {product.name}.",
                            )
                    for product_id, quantity in quantities.items():
                        by_id[product_id].stock -= quantity
                    reservation = Reservation(id=request.order_id, status="reserved")
                    reservation.items = [
                        ReservationItem(product_id=product_id, quantity=quantity)
                        for product_id, quantity in sorted(quantities.items())
                    ]
                    session.add(reservation)
                    response = inventory_pb2.ReservationResponse(order_id=request.order_id, status="reserved")
            return response
        except InventoryRuleError as error:
            context.abort(error.code, str(error))
        except Exception:
            logger.exception("No se pudo completar la reserva para el pedido %s", request.order_id)
            context.abort(grpc.StatusCode.INTERNAL, "No se pudo completar la reserva de inventario.")

    def ReleaseReservation(self, request, context):
        if not request.order_id:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, "El identificador del pedido es obligatorio.")
        try:
            with SessionLocal.begin() as session:
                reservation = session.scalar(
                    select(Reservation)
                    .options(selectinload(Reservation.items))
                    .where(Reservation.id == request.order_id)
                    .with_for_update()
                )
                if reservation is None:
                    raise InventoryRuleError(grpc.StatusCode.NOT_FOUND, "No existe una reserva para este pedido.")
                if reservation.status == "released":
                    response = inventory_pb2.ReservationResponse(order_id=reservation.id, status="released")
                else:
                    product_ids = sorted(item.product_id for item in reservation.items)
                    products = session.scalars(
                        select(Product).where(Product.id.in_(product_ids)).order_by(Product.id).with_for_update()
                    ).all()
                    by_id = {product.id: product for product in products}
                    for item in reservation.items:
                        product = by_id.get(item.product_id)
                        if product is None:
                            raise InventoryRuleError(
                                grpc.StatusCode.INTERNAL,
                                "No se pudo restaurar una línea de inventario.",
                            )
                        product.stock += item.quantity
                    reservation.status = "released"
                    response = inventory_pb2.ReservationResponse(order_id=request.order_id, status="released")
            return response
        except InventoryRuleError as error:
            context.abort(error.code, str(error))
        except Exception:
            logger.exception("No se pudo liberar la reserva del pedido %s", request.order_id)
            context.abort(grpc.StatusCode.INTERNAL, "No se pudo liberar la reserva.")


def serve() -> None:
    port = int(os.getenv("INVENTORY_GRPC_PORT", "50051"))
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    inventory_pb2_grpc.add_InventoryServiceServicer_to_server(InventoryServicer(), server)
    server.add_insecure_port(f"[::]:{port}")
    server.start()
    logger.info("Inventory gRPC listening on port %s", port)
    server.wait_for_termination()


if __name__ == "__main__":
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
    serve()
