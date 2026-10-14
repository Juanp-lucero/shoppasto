from concurrent import futures
import os
import time
import uuid

import grpc
import pytest
from sqlalchemy import delete, select

import inventory_pb2
import inventory_pb2_grpc
import orders_pb2
import orders_pb2_grpc
from app.db import SessionLocal
from app.models import Order, OrderItem, Product, Reservation, ReservationItem
from services.inventory.server import InventoryServicer
from services.orders.server import OrderServicer


@pytest.fixture
def inventory_stub(monkeypatch):
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    inventory_pb2_grpc.add_InventoryServiceServicer_to_server(InventoryServicer(), server)
    port = server.add_insecure_port("127.0.0.1:0")
    server.start()
    target = f"127.0.0.1:{port}"
    monkeypatch.setenv("TEST_INVENTORY_GRPC_TARGET", target)
    channel = grpc.insecure_channel(f"127.0.0.1:{port}")
    grpc.channel_ready_future(channel).result(timeout=5)
    try:
        yield inventory_pb2_grpc.InventoryServiceStub(channel), target
    finally:
        channel.close()
        server.stop(grace=0).wait()


def make_product(stock: int) -> Product:
    with SessionLocal.begin() as session:
        product = Product(
            name=f"Test product {uuid.uuid4()}",
            description="Producto temporal de prueba.",
            category="Pruebas",
            price_cop=1000,
            image_url="",
            stock=stock,
            active=True,
        )
        session.add(product)
        session.flush()
        session.refresh(product)
        return product


def remove_product(product_id: int, reservation_ids: list[str] | None = None) -> None:
    with SessionLocal.begin() as session:
        if reservation_ids:
            session.execute(delete(ReservationItem).where(ReservationItem.reservation_id.in_(reservation_ids)))
            session.execute(delete(Reservation).where(Reservation.id.in_(reservation_ids)))
        product = session.get(Product, product_id)
        if product:
            session.delete(product)


def test_parallel_reservations_cannot_sell_the_last_unit(inventory_stub):
    stub, _ = inventory_stub
    product = make_product(stock=1)
    ids = [str(uuid.uuid4()), str(uuid.uuid4())]

    def reserve(order_id: str):
        try:
            return ("success", stub.ReserveStock(
                    inventory_pb2.ReserveStockRequest(
                        order_id=order_id,
                        items=[inventory_pb2.ReservationItem(product_id=product.id, quantity=1)],
                    ),
                    timeout=5,
                ))
        except grpc.RpcError as error:
            return ("error", error.code())

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(reserve, ids))
    successful_ids = [result.order_id for state, result in results if state == "success"]
    try:
        assert len(successful_ids) == 1
        assert [result for state, result in results if state == "error"] == [
            grpc.StatusCode.FAILED_PRECONDITION
        ]
        released = stub.ReleaseReservation(
            inventory_pb2.ReleaseReservationRequest(order_id=successful_ids[0]), timeout=5
        )
        assert released.status == "released"
        released_again = stub.ReleaseReservation(
            inventory_pb2.ReleaseReservationRequest(order_id=successful_ids[0]), timeout=5
        )
        assert released_again.status == "released"
    finally:
        remove_product(product.id, successful_ids)


def test_missing_product_has_a_structured_not_found_status(inventory_stub):
    stub, _ = inventory_stub
    with pytest.raises(grpc.RpcError) as error:
        stub.GetProduct(inventory_pb2.GetProductRequest(product_id=2_000_000_000), timeout=5)
    assert error.value.code() == grpc.StatusCode.NOT_FOUND


def test_order_service_uses_inventory_grpc_and_cancel_releases_stock(inventory_stub, monkeypatch):
    inventory_stub, target = inventory_stub
    product = make_product(stock=2)
    monkeypatch.setenv("INVENTORY_GRPC_TARGET", target)
    servicer = OrderServicer()
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    orders_pb2_grpc.add_OrderServiceServicer_to_server(servicer, server)
    port = server.add_insecure_port("127.0.0.1:0")
    server.start()
    channel = grpc.insecure_channel(f"127.0.0.1:{port}")
    stub = orders_pb2_grpc.OrderServiceStub(channel)
    order_ids: list[str] = []
    try:
        create_request = orders_pb2.CreateOrderRequest(
            idempotency_key=str(uuid.uuid4()),
            customer_name="Cliente de prueba",
            customer_email="shop-test@example.com",
            items=[orders_pb2.OrderItemRequest(product_id=product.id, quantity=2)],
        )
        created = stub.CreateOrder(create_request, timeout=8)
        order_ids.append(created.id)
        assert created.status == "confirmed"
        assert created.total_cop == 2000
        replay = stub.CreateOrder(create_request, timeout=8)
        assert replay.id == created.id
        conflicting_retry = orders_pb2.CreateOrderRequest(
            idempotency_key=create_request.idempotency_key,
            customer_name=create_request.customer_name,
            customer_email=create_request.customer_email,
            items=[orders_pb2.OrderItemRequest(product_id=product.id, quantity=1)],
        )
        with pytest.raises(grpc.RpcError) as error:
            stub.CreateOrder(conflicting_retry, timeout=5)
        assert error.value.code() == grpc.StatusCode.ALREADY_EXISTS
        cancelled = stub.CancelOrder(orders_pb2.CancelOrderRequest(order_id=created.id), timeout=8)
        assert cancelled.status == "cancelled"
        with SessionLocal() as session:
            refreshed = session.get(Product, product.id)
            assert refreshed.stock == 2
    finally:
        channel.close()
        server.stop(grace=0).wait()
        servicer.inventory_channel.close()
        with SessionLocal.begin() as session:
            session.execute(delete(ReservationItem).where(ReservationItem.reservation_id.in_(order_ids)))
            session.execute(delete(Reservation).where(Reservation.id.in_(order_ids)))
            session.execute(delete(OrderItem).where(OrderItem.order_id.in_(order_ids)))
            session.execute(delete(Order).where(Order.id.in_(order_ids)))
        remove_product(product.id)


def test_insufficient_stock_cancels_the_pending_order(inventory_stub, monkeypatch):
    inventory_stub, target = inventory_stub
    monkeypatch.setenv("INVENTORY_GRPC_TARGET", target)
    servicer = OrderServicer()
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    orders_pb2_grpc.add_OrderServiceServicer_to_server(servicer, server)
    port = server.add_insecure_port("127.0.0.1:0")
    server.start()
    channel = grpc.insecure_channel(f"127.0.0.1:{port}")
    stub = orders_pb2_grpc.OrderServiceStub(channel)
    product = make_product(stock=1)
    key = str(uuid.uuid4())
    order_id: str | None = None
    try:
        with pytest.raises(grpc.RpcError) as error:
            stub.CreateOrder(
                orders_pb2.CreateOrderRequest(
                    idempotency_key=key,
                    customer_name="Cliente de prueba",
                    customer_email="shop-test@example.com",
                    items=[orders_pb2.OrderItemRequest(product_id=product.id, quantity=2)],
                ),
                timeout=8,
            )
        assert error.value.code() == grpc.StatusCode.FAILED_PRECONDITION
        with SessionLocal() as session:
            order = session.scalar(select(Order).where(Order.idempotency_key == key))
            assert order is not None
            assert order.status == "cancelled"
            order_id = order.id
    finally:
        channel.close()
        server.stop(grace=0).wait()
        servicer.inventory_channel.close()
        if order_id:
            with SessionLocal.begin() as session:
                session.execute(delete(OrderItem).where(OrderItem.order_id == order_id))
                session.execute(delete(Order).where(Order.id == order_id))
        remove_product(product.id)


def test_inventory_timeout_is_reported_as_deadline_exceeded(monkeypatch):
    class SlowInventory(InventoryServicer):
        def GetProduct(self, request, context):
            time.sleep(2.5)
            return super().GetProduct(request, context)

    server = grpc.server(futures.ThreadPoolExecutor(max_workers=2))
    inventory_pb2_grpc.add_InventoryServiceServicer_to_server(SlowInventory(), server)
    port = server.add_insecure_port("127.0.0.1:0")
    server.start()
    monkeypatch.setenv("INVENTORY_GRPC_TARGET", f"127.0.0.1:{port}")
    order_servicer = OrderServicer()
    order_server = grpc.server(futures.ThreadPoolExecutor(max_workers=2))
    orders_pb2_grpc.add_OrderServiceServicer_to_server(order_servicer, order_server)
    order_port = order_server.add_insecure_port("127.0.0.1:0")
    order_server.start()
    channel = grpc.insecure_channel(f"127.0.0.1:{order_port}")
    stub = orders_pb2_grpc.OrderServiceStub(channel)
    try:
        with pytest.raises(grpc.RpcError) as error:
            stub.CreateOrder(
                orders_pb2.CreateOrderRequest(
                    idempotency_key=str(uuid.uuid4()),
                    customer_name="Cliente de prueba",
                    customer_email="shop-test@example.com",
                    items=[orders_pb2.OrderItemRequest(product_id=1, quantity=1)],
                ),
                timeout=5,
            )
        assert error.value.code() == grpc.StatusCode.DEADLINE_EXCEEDED
    finally:
        channel.close()
        order_server.stop(grace=0).wait()
        server.stop(grace=0).wait()
        order_servicer.inventory_channel.close()


def test_unavailable_inventory_service_is_reported(monkeypatch):
    monkeypatch.setenv("INVENTORY_GRPC_TARGET", "127.0.0.1:1")
    order_servicer = OrderServicer()
    order_server = grpc.server(futures.ThreadPoolExecutor(max_workers=2))
    orders_pb2_grpc.add_OrderServiceServicer_to_server(order_servicer, order_server)
    order_port = order_server.add_insecure_port("127.0.0.1:0")
    order_server.start()
    channel = grpc.insecure_channel(f"127.0.0.1:{order_port}")
    stub = orders_pb2_grpc.OrderServiceStub(channel)
    try:
        with pytest.raises(grpc.RpcError) as error:
            stub.CreateOrder(
                orders_pb2.CreateOrderRequest(
                    idempotency_key=str(uuid.uuid4()),
                    customer_name="Cliente de prueba",
                    customer_email="shop-test@example.com",
                    items=[orders_pb2.OrderItemRequest(product_id=1, quantity=1)],
                ),
                timeout=5,
            )
        assert error.value.code() == grpc.StatusCode.UNAVAILABLE
    finally:
        channel.close()
        order_server.stop(grace=0).wait()
        order_servicer.inventory_channel.close()
