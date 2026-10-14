from types import SimpleNamespace

import pytest

from services.inventory.server import normalized_items
from services.orders.server import fingerprint


def test_inventory_rejects_empty_or_nonpositive_items():
    with pytest.raises(ValueError):
        normalized_items([])
    with pytest.raises(ValueError):
        normalized_items([SimpleNamespace(product_id=1, quantity=0)])


def test_inventory_rejects_duplicate_products():
    with pytest.raises(ValueError, match="repetidos"):
        normalized_items([
            SimpleNamespace(product_id=7, quantity=1),
            SimpleNamespace(product_id=7, quantity=2),
        ])


def test_order_fingerprint_is_stable_and_order_independent():
    first = fingerprint("Ana", "ana@example.com", {9: 1, 2: 3})
    second = fingerprint("Ana", "ana@example.com", {2: 3, 9: 1})
    different = fingerprint("Ana", "ana@example.com", {2: 3, 9: 2})
    assert first == second
    assert first != different
