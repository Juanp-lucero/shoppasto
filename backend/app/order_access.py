import hashlib
import hmac
import os


class OrderAccessConfigurationError(RuntimeError):
    pass


def _configured_secret() -> bytes:
    secret = os.getenv("SESSION_SECRET", "").encode()
    if len(secret) < 32:
        raise OrderAccessConfigurationError(
            "SESSION_SECRET must contain at least 32 bytes to protect order access."
        )
    return secret


def order_access_token(order_id: str) -> str:
    """Return a stable, unguessable bearer token bound to one order."""
    message = b"shoppasto-order-access:v1:" + order_id.encode()
    digest = hmac.new(_configured_secret(), message, hashlib.sha256).digest()
    return digest.hex()


def has_order_access(order_id: str, token: str) -> bool:
    if not token:
        return False
    try:
        expected = order_access_token(order_id)
    except OrderAccessConfigurationError:
        return False
    return hmac.compare_digest(expected, token)
