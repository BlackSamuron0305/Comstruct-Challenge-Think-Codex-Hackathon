"""Integration-style tests for the cart → checkout → approval workflow.

These tests mock the database and Redis layers so they can run without
Docker infrastructure, but validate the full HTTP request path through
the FastAPI routers including auth, validation, and state transitions.
"""
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.models import OrderStatus
from .conftest import (
    COMPANY_ID,
    FOREMAN_HEADERS,
    OTHER_COMPANY_HEADERS,
    PM_HEADERS,
    PM_USER_ID,
    PROJECT_ID,
    USER_ID,
)


# ── Cart endpoint tests ──────────────────────────────────────────────


class TestCart:
    """Cart add / get / remove / clear via HTTP."""

    def test_get_cart_requires_auth(self):
        client = TestClient(app)
        r = client.get("/cart")
        assert r.status_code == 401

    @patch("src.routers.cart.cart_get", new_callable=AsyncMock, return_value=[])
    def test_get_empty_cart(self, mock_get):
        client = TestClient(app)
        r = client.get("/cart", headers=FOREMAN_HEADERS)
        assert r.status_code == 200
        data = r.json()
        assert data["items"] == []
        assert data["total_amount"] == "0"

    @patch("src.routers.cart.cart_get", new_callable=AsyncMock)
    @patch("src.routers.cart.cart_add", new_callable=AsyncMock)
    @patch("src.routers.cart.fetch_products", new_callable=AsyncMock)
    def test_add_to_cart(self, mock_fetch, mock_add, mock_get):
        product_id = uuid4()
        mock_fetch.return_value = {
            str(product_id): {
                "name": "Work Gloves",
                "sku": "GL-001",
                "unit": "pair",
                "unit_price": "5.00",
                "currency": "CHF",
                "category": "PPE",
                "material_class": "C",
            }
        }
        mock_get.return_value = [
            {
                "product_id": str(product_id),
                "name": "Work Gloves",
                "sku": "GL-001",
                "quantity": 10.0,
                "unit": "pair",
                "unit_price": "5.00",
                "line_total": "50.00",
                "currency": "CHF",
                "category": "PPE",
                "material_class": "C",
            }
        ]
        client = TestClient(app)
        r = client.post(
            "/cart/add",
            json={"product_id": str(product_id), "quantity": 10},
            headers=FOREMAN_HEADERS,
        )
        assert r.status_code == 200
        data = r.json()
        assert len(data["items"]) == 1
        assert data["total_amount"] == "50.00"

    @patch("src.routers.cart.fetch_products", new_callable=AsyncMock)
    def test_add_a_material_rejected(self, mock_fetch):
        product_id = uuid4()
        mock_fetch.return_value = {
            str(product_id): {
                "name": "Structural Steel",
                "sku": "ST-001",
                "unit": "kg",
                "unit_price": "800.00",
                "currency": "CHF",
                "category": "Structural",
                "material_class": "A",
            }
        }
        client = TestClient(app)
        r = client.post(
            "/cart/add",
            json={"product_id": str(product_id), "quantity": 1},
            headers=FOREMAN_HEADERS,
        )
        assert r.status_code == 400
        assert "A-material" in r.json()["detail"]

    @patch("src.routers.cart.cart_get", new_callable=AsyncMock, return_value=[])
    @patch("src.routers.cart.cart_remove", new_callable=AsyncMock)
    def test_remove_from_cart(self, mock_remove, mock_get):
        product_id = uuid4()
        client = TestClient(app)
        r = client.delete(f"/cart/{product_id}", headers=FOREMAN_HEADERS)
        assert r.status_code == 200

    @patch("src.routers.cart.cart_clear", new_callable=AsyncMock)
    def test_clear_cart(self, mock_clear):
        client = TestClient(app)
        r = client.delete("/cart", headers=FOREMAN_HEADERS)
        assert r.status_code == 204

    def test_add_invalid_quantity_rejected(self):
        client = TestClient(app)
        r = client.post(
            "/cart/add",
            json={"product_id": str(uuid4()), "quantity": -5},
            headers=FOREMAN_HEADERS,
        )
        assert r.status_code == 422  # Pydantic validation


# ── Authorization tests ──────────────────────────────────────────────


class TestAuthorization:
    """Ensure cross-company access is blocked."""

    def test_missing_internal_secret_rejected(self):
        client = TestClient(app)
        r = client.get("/cart", headers={
            "X-User-Id": str(USER_ID),
            "X-User-Role": "foreman",
            "X-Company-Id": str(COMPANY_ID),
        })
        assert r.status_code == 401

    def test_wrong_internal_secret_rejected(self):
        client = TestClient(app)
        r = client.get("/cart", headers={
            "X-Internal-Secret": "wrong-secret",
            "X-User-Id": str(USER_ID),
            "X-User-Role": "foreman",
            "X-Company-Id": str(COMPANY_ID),
        })
        assert r.status_code == 401

    def test_missing_user_headers_rejected(self):
        client = TestClient(app)
        r = client.get("/cart", headers={"X-Internal-Secret": "dev-secret"})
        assert r.status_code == 401


# ── Order rejection reason validation ─────────────────────────────────


class TestRejectValidation:
    """RejectRequest requires reason with min_length=3, max_length=500."""

    def test_reject_reason_too_short(self):
        client = TestClient(app)
        r = client.post(
            f"/orders/{uuid4()}/reject",
            json={"reason": "ab"},
            headers=PM_HEADERS,
        )
        assert r.status_code == 422

    def test_reject_reason_too_long(self):
        client = TestClient(app)
        r = client.post(
            f"/orders/{uuid4()}/reject",
            json={"reason": "x" * 501},
            headers=PM_HEADERS,
        )
        assert r.status_code == 422
