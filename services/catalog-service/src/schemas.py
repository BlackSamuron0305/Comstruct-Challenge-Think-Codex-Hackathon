from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SupplierCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: str | None = None
    phone: str | None = None
    contact_name: str | None = None
    avatar_url: str | None = None


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
    supplier_name: str | None = None
    sku: str
    internal_sku: str
    name: str
    description: str | None
    category: str | None
    manufacturer: str | None = None
    manufacturer_sku: str | None = None
    ean: str | None = None
    image_url: str | None = None
    special_info: dict | None = None
    taxonomy_code: str | None = None
    taxonomy_label: str | None = None
    material_class: str
    unit: str
    packaging_qty: Decimal
    unit_price: Decimal
    currency: str
    source_delivery_days: Decimal | None = None
    expected_delivery_days: Decimal | None = None
    delivery_confidence: Decimal | None = None
    must_order: bool = False
    base_discount_pct: Decimal = Decimal("0")
    bulk_discount_pct: Decimal = Decimal("0")
    bulk_discount_threshold: Decimal | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ProductBulkUpsert(BaseModel):
    supplier_id: UUID
    sku: str
    name: str
    description: str | None = None
    category: str | None = None
    manufacturer: str | None = None
    manufacturer_sku: str | None = None
    ean: str | None = None
    image_url: str | None = None
    special_info: dict | None = None
    taxonomy_code: str | None = None
    taxonomy_label: str | None = None
    material_class: str = Field(default="C", pattern="^[ABC]$")
    unit: str
    packaging_qty: Decimal = Decimal("1")
    unit_price: Decimal
    currency: str = "EUR"
    source_delivery_days: Decimal | None = None
    expected_delivery_days: Decimal | None = None
    must_order: bool = False
    base_discount_pct: Decimal = Decimal("0")
    bulk_discount_pct: Decimal = Decimal("0")
    bulk_discount_threshold: Decimal | None = None
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


class ProductRecommendationOut(ProductOut):
    effective_unit_price: Decimal
    price_score: Decimal
    delivery_score: Decimal
    overall_score: Decimal
    recommendation_bucket: str
    recommendation_tags: list[str] = []


class ProductRecommendationsResponse(BaseModel):
    query: str | None = None
    product_id: UUID | None = None
    requested_quantity: Decimal = Decimal("1")
    weights: dict[str, Decimal]
    top_choices: list[ProductRecommendationOut]
    others: list[ProductRecommendationOut]


class CategoryNode(BaseModel):
    name: str
    product_count: int
