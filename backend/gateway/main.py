from contextlib import asynccontextmanager
import os

import grpc
from fastapi import FastAPI, Header, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, EmailStr, Field

import inventory_pb2
import inventory_pb2_grpc
import orders_pb2
import orders_pb2_grpc
from app.errors import raise_http_from_rpc


class ProductOut(BaseModel):
    id: int
    name: str
    description: str
    category: str
    price_cop: int
    image_url: str
    stock: int
    active: bool


class OrderItemIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=100)


class OrderCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    customer_name: str = Field(min_length=2, max_length=120)
    customer_email: EmailStr
    items: list[OrderItemIn] = Field(min_length=1, max_length=30)


class OrderItemOut(BaseModel):
    product_id: int
    product_name: str
    unit_price_cop: int
    quantity: int
    line_total_cop: int


class OrderOut(BaseModel):
    id: str
    customer_name: str
    customer_email: EmailStr
    status: str
    total_cop: int
    created_at: str
    items: list[OrderItemOut]


def configure_cors(app: FastAPI, raw_origins: str) -> None:
    origins = list(dict.fromkeys(
        origin.strip().rstrip("/")
        for origin in raw_origins.split(",")
        if origin.strip()
    ))
    if "*" in origins:
        raise ValueError("CORS_ALLOWED_ORIGINS must list exact origins; wildcard access is not allowed.")
    if not origins:
        return
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "Idempotency-Key"],
        max_age=600,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    inventory_channel = grpc.insecure_channel(os.getenv("INVENTORY_GRPC_TARGET", "inventory:50051"))
    orders_channel = grpc.insecure_channel(os.getenv("ORDERS_GRPC_TARGET", "orders:50052"))
    app.state.inventory = inventory_pb2_grpc.InventoryServiceStub(inventory_channel)
    app.state.orders = orders_pb2_grpc.OrderServiceStub(orders_channel)
    app.state.channels = [inventory_channel, orders_channel]
    yield
    for channel in app.state.channels:
        channel.close()


app = FastAPI(
    title="ShopPasto API",
    description="API REST para catálogo y pedidos; la coordinación de inventario usa gRPC.",
    version="1.0.0",
    lifespan=lifespan,
)
configure_cors(app, os.getenv("CORS_ALLOWED_ORIGINS", ""))


def rpc_call(callable_rpc, request_message):
    try:
        return callable_rpc(request_message, timeout=3.0)
    except grpc.RpcError as error:
        raise_http_from_rpc(error)


def as_order(message: orders_pb2.Order) -> dict:
    return {
        "id": message.id,
        "customer_name": message.customer_name,
        "customer_email": message.customer_email,
        "status": message.status,
        "total_cop": message.total_cop,
        "created_at": message.created_at,
        "items": [
            {
                "product_id": item.product_id,
                "product_name": item.product_name,
                "unit_price_cop": item.unit_price_cop,
                "quantity": item.quantity,
                "line_total_cop": item.line_total_cop,
            }
            for item in message.items
        ],
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/products", response_model=list[ProductOut])
def list_products(
    request: Request,
    q: str | None = Query(default=None, max_length=100),
    category: str | None = Query(default=None, max_length=80),
):
    response = rpc_call(
        request.app.state.inventory.ListProducts,
        inventory_pb2.ListProductsRequest(category=category or ""),
    )
    term = (q or "").strip().casefold()
    products = [
        product for product in response.products
        if not term or term in product.name.casefold() or term in product.description.casefold()
    ]
    return [ProductOut(
        id=p.id,
        name=p.name,
        description=p.description,
        category=p.category,
        price_cop=p.price_cop,
        image_url=p.image_url,
        stock=p.stock,
        active=p.active,
    ) for p in products]


@app.get("/api/products/{product_id}", response_model=ProductOut)
def get_product(request: Request, product_id: int):
    p = rpc_call(request.app.state.inventory.GetProduct, inventory_pb2.GetProductRequest(product_id=product_id))
    return ProductOut(
        id=p.id,
        name=p.name,
        description=p.description,
        category=p.category,
        price_cop=p.price_cop,
        image_url=p.image_url,
        stock=p.stock,
        active=p.active,
    )


@app.post("/api/orders", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def create_order(
    body: OrderCreateIn,
    request: Request,
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=8, max_length=120),
):
    product_ids = [item.product_id for item in body.items]
    if len(product_ids) != len(set(product_ids)):
        raise HTTPException(status_code=400, detail="Envía cada producto una sola vez.")
    rpc_order = rpc_call(
        request.app.state.orders.CreateOrder,
        orders_pb2.CreateOrderRequest(
            idempotency_key=idempotency_key,
            customer_name=body.customer_name.strip(),
            customer_email=str(body.customer_email).lower(),
            items=[
                orders_pb2.OrderItemRequest(product_id=item.product_id, quantity=item.quantity)
                for item in body.items
            ],
        ),
    )
    return as_order(rpc_order)


@app.get("/api/orders", response_model=list[OrderOut])
def list_orders(request: Request, email: EmailStr = Query()):
    result = rpc_call(
        request.app.state.orders.ListOrdersByEmail,
        orders_pb2.ListOrdersByEmailRequest(customer_email=str(email).lower()),
    )
    return [as_order(order) for order in result.orders]


@app.get("/api/orders/{order_id}", response_model=OrderOut)
def get_order(request: Request, order_id: str):
    result = rpc_call(request.app.state.orders.GetOrder, orders_pb2.GetOrderRequest(order_id=order_id))
    return as_order(result)


@app.post("/api/orders/{order_id}/cancel", response_model=OrderOut)
def cancel_order(request: Request, order_id: str):
    result = rpc_call(request.app.state.orders.CancelOrder, orders_pb2.CancelOrderRequest(order_id=order_id))
    return as_order(result)
