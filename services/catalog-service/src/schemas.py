from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SupplierOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    email: str | None
    phone: str | None
    contact_name: str | None
    avatar_url: str | None


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    supplier_id: UUID
    sku: str
    internal_sku: str
    name: str
    description: str | None
    category: str | None
    material_class: str
    unit: str
    packaging_qty: Decimal
    unit_price: Decimal
    currency: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ProductBulkUpsert(BaseModel):
    supplier_id: UUID
    sku: str
    name: str
    description: str | None = None
    category: str | None = None
    material_class: str = Field(default="C", pattern="^[ABC]$")
    unit: str
    packaging_qty: Decimal = Decimal("1")
    unit_price: Decimal
    currency: str = "CHF"
    is_active: bool = True
    embedding: list[float] | None = None


class BulkUpsertRequest(BaseModel):
    products: list[ProductBulkUpsert]


class BulkUpsertResponse(BaseModel):
    upserted: int
    skipped_a_class: int
    errors: list[str] = []


class SearchByVectorRequest(BaseModel):
    embedding: list[float]
    limit: int = 20
    category: str | None = None


class CategoryNode(BaseModel):
    name: str
    product_count: int
