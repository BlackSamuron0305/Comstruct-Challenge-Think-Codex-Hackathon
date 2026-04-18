from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CartLineIn(BaseModel):
    product_id: UUID
    quantity: float = Field(gt=0)


class CartLineOut(BaseModel):
    product_id: UUID
    name: str
    sku: str
    category: str | None = None
    material_class: str = "C"
    quantity: float
    unit: str
    unit_price: str
    line_total: str
    currency: str


class CartOut(BaseModel):
    items: list[CartLineOut]
    total_amount: str
    currency: str


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    product_id: UUID
    product_snapshot: dict
    quantity: Decimal
    unit: str
    unit_price: Decimal
    line_total: Decimal


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    company_id: UUID
    project_id: UUID
    foreman_id: UUID
    status: str
    total_amount: Decimal
    currency: str
    requires_approval: bool
    approver_id: UUID | None
    rejection_reason: str | None
    supplier_order_ref: str | None
    requested_delivery: datetime | None
    notes: str | None
    items: list[OrderItemOut] = []
    created_at: datetime
    updated_at: datetime


class CheckoutRequest(BaseModel):
    project_id: UUID
    requested_delivery: datetime | None = None
    notes: str | None = None


class RejectRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class ApprovalRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    company_id: UUID
    threshold_amount: Decimal
    auto_approve_below: bool
    restricted_categories: list[str]
    approver_role: str


class ApprovalRuleUpsert(BaseModel):
    threshold_amount: Decimal
    auto_approve_below: bool = True
    restricted_categories: list[str] = []
    approver_role: str = "project_manager"
