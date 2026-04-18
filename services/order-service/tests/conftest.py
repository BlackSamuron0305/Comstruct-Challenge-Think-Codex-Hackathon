"""Shared fixtures for order-service tests."""
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from src.main import app

COMPANY_ID = uuid4()
USER_ID = uuid4()
PM_USER_ID = uuid4()
PROJECT_ID = uuid4()

INTERNAL_SECRET = "dev-secret"

# Headers simulating what the API-gateway injects after JWT verification.
FOREMAN_HEADERS = {
    "X-Internal-Secret": INTERNAL_SECRET,
    "X-User-Id": str(USER_ID),
    "X-User-Role": "foreman",
    "X-Company-Id": str(COMPANY_ID),
}

PM_HEADERS = {
    "X-Internal-Secret": INTERNAL_SECRET,
    "X-User-Id": str(PM_USER_ID),
    "X-User-Role": "procurement_worker",
    "X-Company-Id": str(COMPANY_ID),
}

OTHER_COMPANY_HEADERS = {
    "X-Internal-Secret": INTERNAL_SECRET,
    "X-User-Id": str(uuid4()),
    "X-User-Role": "foreman",
    "X-Company-Id": str(uuid4()),
}


@pytest.fixture
def client():
    return TestClient(app)
