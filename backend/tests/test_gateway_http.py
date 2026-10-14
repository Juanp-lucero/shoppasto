from concurrent import futures
import uuid

import grpc
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

import inventory_pb2_grpc
import orders_pb2_grpc
from app.db import SessionLocal
from app.models import Order, OrderItem, Product, Reservation, ReservationItem
from gateway.main import app
from services.inventory.server import InventoryServicer
from services.orders.server import OrderServicer


@pytest.fixture
def gateway_client(monkeypatch):
    monkeypatch.setenv("SESSION_SECRET", "test-only-secret-with-at-least-32-bytes-long")
    inventory_executor = futures.ThreadPoolExecutor(max_workers=8)
    inventory_server = grpc.server(inventory_executor)
    inventory_pb2_grpc.add_InventoryServiceServicer_to_server(InventoryServicer(), inventory_server)
    inventory_port = inventory_server.add_insecure_port("127.0.0.1:0")
    inventory_server.start()
    inventory_target = f"127.0.0.1:{inventory_port}"
    monkeypatch.setenv("INVENTORY_GRPC_TARGET", inventory_target)

    order_servicer = OrderServicer()
    orders_executor = futures.ThreadPoolExecutor(max_workers=8)
    orders_server = grpc.server(orders_executor)
    orders_pb2_grpc.add_OrderServiceServicer_to_server(order_servicer, orders_server)
    orders_port = orders_server.add_insecure_port("127.0.0.1:0")
    orders_server.start()
    monkeypatch.setenv("ORDERS_GRPC_TARGET", f"127.0.0.1:{orders_port}")

    try:
        with TestClient(app) as client:
            yield client
    finally:
        orders_server.stop(grace=0).wait()
        inventory_server.stop(grace=0).wait()
        order_servicer.inventory_channel.close()
        orders_executor.shutdown(wait=True)
        inventory_executor.shutdown(wait=True)


def make_product(stock: int = 2) -> int:
    with SessionLocal.begin() as session:
        product = Product(
            name=f"REST shop product {uuid.uuid4().hex[:8]}",
            description="Producto temporal para validar FastAPI.",
            category="Pruebas REST",
            price_cop=1500,
            image_url="",
            stock=stock,
            active=True,
        )
        session.add(product)
        session.flush()
        return product.id


def clean_test_data(product_id: int, keys: list[str]) -> None:
    with SessionLocal.begin() as session:
        order_ids = session.scalars(select(Order.id).where(Order.idempotency_key.in_(keys))).all()
        if order_ids:
            session.execute(delete(ReservationItem).where(ReservationItem.reservation_id.in_(order_ids)))
            session.execute(delete(Reservation).where(Reservation.id.in_(order_ids)))
            session.execute(delete(OrderItem).where(OrderItem.order_id.in_(order_ids)))
            session.execute(delete(Order).where(Order.id.in_(order_ids)))
        session.execute(delete(Product).where(Product.id == product_id))


def test_rest_catalog_search_not_found_and_input_validation(gateway_client):
    product_id = make_product(stock=1)
    try:
        response = gateway_client.get("/api/products", params={"q": "REST shop", "category": "Pruebas REST"})
        assert response.status_code == 200
        assert [product["id"] for product in response.json()] == [product_id]
        assert gateway_client.get("/api/products/2000000000").status_code == 404
        assert gateway_client.get("/api/products/0").status_code == 400

        invalid = gateway_client.post(
            "/api/orders",
            headers={"Idempotency-Key": str(uuid.uuid4())},
            json={
                "customer_name": "Ana de prueba",
                "customer_email": "ana@example.com",
                "items": [{"product_id": product_id, "quantity": 0}],
            },
        )
        assert invalid.status_code == 422
    finally:
        clean_test_data(product_id, [])


def test_rest_create_retry_lookup_cancel_and_insufficient_stock(gateway_client):
    product_id = make_product(stock=3)
    success_key = str(uuid.uuid4())
    other_key = str(uuid.uuid4())
    insufficient_key = str(uuid.uuid4())
    email = f"rest-{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "customer_name": "Cliente de pruebas",
        "customer_email": email,
        "items": [{"product_id": product_id, "quantity": 2}],
    }
    try:
        created = gateway_client.post(
            "/api/orders",
            headers={"Idempotency-Key": success_key},
            json=payload,
        )
        assert created.status_code == 201
        order = created.json()
        assert order["status"] == "confirmed"
        assert order["total_cop"] == 3000
        access = order["access_token"]
        headers = {"Authorization": f"Bearer {access}"}

        replay = gateway_client.post(
            "/api/orders",
            headers={"Idempotency-Key": success_key},
            json=payload,
        )
        assert replay.status_code == 201
        assert replay.json()["id"] == order["id"]
        assert replay.json()["access_token"] == access

        conflict = gateway_client.post(
            "/api/orders",
            headers={"Idempotency-Key": success_key},
            json={**payload, "items": [{"product_id": product_id, "quantity": 1}]},
        )
        assert conflict.status_code == 409
        assert gateway_client.get("/api/orders", params={"email": email}).status_code == 401
        assert gateway_client.get(f"/api/orders/{order['id']}").status_code == 401
        assert gateway_client.post(f"/api/orders/{order['id']}/cancel", json={}).status_code == 401

        other_email = f"other-{uuid.uuid4().hex[:8]}@example.com"
        other = gateway_client.post(
            "/api/orders",
            headers={"Idempotency-Key": other_key},
            json={
                "customer_name": "Otra persona",
                "customer_email": other_email,
                "items": [{"product_id": product_id, "quantity": 1}],
            },
        ).json()
        other_headers = {"Authorization": f"Bearer {other['access_token']}"}

        assert gateway_client.get("/api/orders", params={"email": email}, headers=headers).json() == [
            {key: value for key, value in order.items() if key != "access_token"}
        ]
        assert gateway_client.get(
            "/api/orders", params={"email": email}, headers=other_headers
        ).json() == []
        assert gateway_client.get(f"/api/orders/{order['id']}", headers=other_headers).status_code == 404
        denied_cancel = gateway_client.post(
            f"/api/orders/{order['id']}/cancel", json={}, headers=other_headers
        )
        assert denied_cancel.status_code == 404
        assert gateway_client.get(f"/api/orders/{order['id']}", headers=headers).status_code == 200
        assert gateway_client.post(f"/api/orders/{order['id']}/cancel", json={}, headers=headers).status_code == 200
        assert gateway_client.get(f"/api/orders/{order['id']}", headers=headers).json()["status"] == "cancelled"

        cancelled = gateway_client.post(f"/api/orders/{order['id']}/cancel", json={}, headers=headers)
        assert cancelled.status_code == 200
        assert cancelled.json()["status"] == "cancelled"
        assert gateway_client.post(
            f"/api/orders/{order['id']}/cancel", json={}, headers=headers
        ).json()["status"] == "cancelled"
        assert gateway_client.get(f"/api/products/{product_id}").json()["stock"] == 2

        insufficient = gateway_client.post(
            "/api/orders",
            headers={"Idempotency-Key": insufficient_key},
            json={**payload, "items": [{"product_id": product_id, "quantity": 3}]},
        )
        assert insufficient.status_code == 409
    finally:
        clean_test_data(product_id, [success_key, other_key, insufficient_key])


def test_rest_reports_grpc_inventory_unavailable(monkeypatch):
    monkeypatch.setenv("INVENTORY_GRPC_TARGET", "127.0.0.1:1")
    monkeypatch.setenv("ORDERS_GRPC_TARGET", "127.0.0.1:1")
    with TestClient(app) as client:
        response = client.get("/api/products")
    assert response.status_code == 503
