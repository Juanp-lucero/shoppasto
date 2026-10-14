import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from gateway.main import configure_cors


def make_app(origins: str) -> FastAPI:
    app = FastAPI()
    app.post("/api/orders")(lambda: {"ok": True})
    configure_cors(app, origins)
    return app


def test_cors_preflight_allows_the_configured_storefront_origin():
    origin = "https://shop.example.test"
    with TestClient(make_app(f" {origin}/,https://preview.example.test ")) as client:
        response = client.options(
            "/api/orders",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,idempotency-key,authorization",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert "POST" in response.headers["access-control-allow-methods"]
    assert "idempotency-key" in response.headers["access-control-allow-headers"].lower()
    assert "authorization" in response.headers["access-control-allow-headers"].lower()


def test_cors_rejects_origins_not_in_the_allowlist():
    with TestClient(make_app("https://shop.example.test")) as client:
        response = client.options(
            "/api/orders",
            headers={
                "Origin": "https://attacker.example.test",
                "Access-Control-Request-Method": "POST",
            },
        )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_cors_does_not_allow_a_wildcard_origin():
    with pytest.raises(ValueError, match="exact origins"):
        make_app("*")
