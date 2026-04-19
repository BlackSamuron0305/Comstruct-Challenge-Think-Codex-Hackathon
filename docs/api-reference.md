# API Reference — comstruct C-Materials Platform

All endpoints are accessed through the **API Gateway** at port `8001`. Authentication is required for all `/api/*` routes (RS256 JWT Bearer token).

---

## Authentication

### `POST /auth/login`

Login with email/password. Returns JWT access + refresh tokens.

**Body:**
```json
{ "email": "foreman@brueckesg.ch", "password": "comstruct-demo" }
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "user": { "id": "uuid", "email": "...", "role": "foreman", "full_name": "...", "company_id": "uuid" }
}
```

### `POST /auth/refresh`

Refresh an expired access token.

**Body:**
```json
{ "refresh_token": "eyJ..." }
```

### `GET /auth/me`

Get current authenticated user profile. Requires `Authorization: Bearer <token>`.

---

## Cart

### `GET /api/cart`

Get current user's shopping cart contents.

### `POST /api/cart/add`

Add item to cart. Validates product exists, checks material class, applies discounts.

**Body:**
```json
{ "product_id": "uuid", "quantity": 10 }
```

### `DELETE /api/cart/{product_id}`

Remove specific item from cart.

### `DELETE /api/cart`

Clear entire cart.

---

## Orders

### `GET /api/orders`

List orders. Filterable by `status`, `project_id`. Role-scoped: construction workers see only their orders; procurement sees all company orders.

**Query params:** `?status=pending_approval&project_id=uuid&limit=50&offset=0`

### `GET /api/orders/{order_id}`

Get full order details including line items and foreman name.

### `POST /api/orders/checkout`

Convert cart to an order. Triggers approval engine and state machine.

**Body:**
```json
{ "project_id": "uuid", "notes": "Needed for Monday" }
```

**Approval Engine Logic:**
1. A-material check → blocks if structural material detected
2. Statistical risk analysis → z-score anomaly detection on quantities
3. Restricted category check → manual review if category flagged
4. Threshold check → auto-approve if total below company threshold

### `POST /api/orders/{id}/approve`

Approve a pending order. Requires `procurement_worker` or `foreman` role.

### `POST /api/orders/{id}/reject`

Reject an order with reason. Requires `procurement_worker` or `foreman` role.

**Body:**
```json
{ "reason": "Budget exceeded for this quarter" }
```

### `POST /api/orders/{id}/mark-in-transit`

Mark approved order as shipped.

### `POST /api/orders/{id}/mark-delivered`

Mark order as delivered on site.

### `DELETE /api/orders/{id}`

Delete a draft order.

---

## Approvals

### `GET /api/approvals/rule`

Get company's approval rule configuration (threshold, restricted categories, approver role).

### `PUT /api/approvals/rule`

Upsert approval rule. Requires `procurement_worker` role.

**Body:**
```json
{
  "threshold_amount": 200.00,
  "auto_approve_below": true,
  "restricted_categories": ["Electrical", "Tools"],
  "approver_role": "foreman"
}
```

---

## Projects

### `GET /api/projects`

List active projects for the authenticated user's company.

### `GET /api/projects/{project_id}`

Get project details (name, site address, trade, active status).

---

## Catalog — Products

### `GET /api/products`

List products (paginated). Returns catalog items with price, supplier, category.

**Query params:** `?limit=50&offset=0&category=PPE&search=gloves`

### `GET /api/products/{id}`

Get single product details.

### `POST /api/products/search-by-vector`

Semantic search using pgvector embeddings. Finds products by natural language description.

**Body:**
```json
{ "query": "safety gloves for steel work", "limit": 10 }
```

### `GET /api/categories`

List all product categories.

---

## Catalog — Suppliers

### `POST /api/suppliers`

Create or update a supplier.

**Body:**
```json
{
  "name": "ACME Supplies",
  "email": "sales@acme.ch",
  "phone": "+41 44 123 4567",
  "contact_name": "Hans Müller",
  "supports_api": false,
  "supports_documents": true
}
```

### `GET /api/suppliers`

List active suppliers.

### `GET /api/suppliers/{id}`

Get supplier details.

### `PATCH /api/suppliers/{id}`

Update supplier information.

---

## AI Service

### `POST /api/ai/classify`

A/B/C material classification. Deterministic rules + LLM assist.

**Body:**
```json
{
  "name": "Hex Bolt M12",
  "category": "Fasteners",
  "price": 0.35,
  "description": "Galvanised hex bolt"
}
```

**Response:**
```json
{
  "material_class": "C",
  "confidence": 0.92,
  "reasoning": "Low-value fastener, unit price < 5 CHF, no structural keywords"
}
```

### `POST /api/ai/recommend`

Task-based product recommendations using vector search + ranking.

**Body:**
```json
{
  "task_description": "Installing drywall in office partition",
  "project_type": "interior",
  "limit": 8
}
```

### `POST /api/ai/map-columns`

Map CSV column headers to the canonical product schema using LLM.

**Body:**
```json
{ "columns": ["Artikelnr.", "Bezeichnung", "Preis CHF", "Einheit"] }
```

### `POST /api/ai/chat`

Single-turn construction materials Q&A. Grounded in catalog data.

**Body:**
```json
{
  "message": "What screws do I need for drywall?",
  "project_id": "uuid"
}
```

### `POST /api/ai/chat/stream`

Same as `/ai/chat` but returns Server-Sent Events for streaming responses.

### `POST /api/ai/analyze-photo`

Analyze a construction photo description and suggest materials.

### `POST /api/ai/upload-image`

Upload an image for OCR/vision analysis.

### `POST /api/ai/transcribe-audio`

Transcribe voice message to text (OpenAI Whisper).

---

## Document Extraction

### `POST /api/ai/extract-pdf`

Extract structured data from PDF invoices/quotes with delta detection against existing catalog.

### `POST /api/ai/extract-excel`

Parse Excel price lists with AI-assisted column mapping.

### `POST /api/ai/extract-image`

OCR image → structured product extraction.

### `POST /api/ai/extract-text`

Extract product data from freeform text (WhatsApp messages, notes).

**Supported formats:** CSV, TSV, XLSX, XLS, ODS, DOCX, PDF, JPEG, PNG, WebP, TIFF, BMP

---

## Ingestion

### `POST /api/ingest/supplier-file`

Ingest supplier CSV/Excel file. Async processing with Redis progress events.

**Body:** `multipart/form-data` with file upload + `supplier_id`

**Progress:** Published via WebSocket channel `ai.progress.{job_id}`

### `POST /api/ingest/rows`

Direct JSON row ingestion (API-to-API, offline queue replay).

**Body:**
```json
{
  "supplier_id": "uuid",
  "rows": [
    { "name": "Work Gloves", "sku": "GL-001", "price": 12.50, "unit": "pair", "category": "PPE" }
  ]
}
```

### `POST /api/ingest/preview`

Preview extracted data before committing to catalog.

### `POST /api/ingest/preview-url`

Fetch and preview a remote catalog URL.

---

## Supplier Scoring

### `POST /api/supplier-scoring/{id}/compute-score`

Compute composite score from 5 dimensions (price 25%, delivery 25%, trust 15%, web quality 20%, specs fit 15%).

### `GET /api/supplier-scoring/{id}/score-breakdown`

Full scoring breakdown with per-dimension detail.

### `GET /api/supplier-scoring/compare`

Multi-supplier comparison for a product.

**Query params:** `?product_id=uuid&supplier_ids=uuid1,uuid2`

### `GET /api/supplier-scoring/{id}/approval-recommendation`

Auto-approve/reject recommendation with confidence score.

| Score Range | Recommendation |
|-------------|---------------|
| ≥ 75 | Auto-approved (low risk) |
| 50–74 | Manual review (medium risk) |
| < 50 | Manual review required (high risk) |

### `POST /api/supplier-scoring/{id}/scrape`

Trigger web scraping job for supplier price lists.

### `POST /api/supplier-scoring/web-search`

Web search for supplier intelligence.

### `POST /api/supplier-scoring/proposals`

Create supplier proposal (search → score → propose).

### `GET /api/supplier-scoring/preferred/{company_id}`

Get preferred/approved suppliers for a company.

---

## AI Workflows

### `POST /api/ai/workflow/auto-approve`

AI-driven auto-approval evaluation for an order.

### `POST /api/ai/workflow/price-analysis`

Compare current vs. historical prices for items.

### `POST /api/ai/workflow/reorder-check`

Predict material stock depletion and suggest reorders.

### `POST /api/ai/workflow/compliance-check`

Verify order against budgets and regulations.

---

## Notification (Internal)

These endpoints are called by backend services, not directly by clients.

### `POST /notify`

Send notification (email + push) based on event type.

**Body:**
```json
{
  "event": "order_pending_approval",
  "to_user_id": "uuid",
  "to_email": "pm@brueckesg.ch",
  "data": { "order_id": "uuid", "total": "290.00 CHF", "foreman_name": "Max Müller" }
}
```

### `POST /push`

Send push notification only (Firebase Cloud Messaging).

---

## WebSocket

### `ws://host:8001/ws`

Real-time event stream. Authenticate via message after connection:

```json
{"type": "auth", "token": "<jwt_access_token>"}
```

**Subscribe to channels:**
```json
{"type": "subscribe", "channel": "order.status.{order_id}"}
```

---

## Health Checks

All services expose a health endpoint:

| Service | URL |
|---------|-----|
| API Gateway | `GET http://localhost:8001/health` |
| Order Service | `GET http://localhost:8002/health` |
| Catalog Service | `GET http://localhost:8003/health` |
| Notification Service | `GET http://localhost:8004/health` |
| AI Service | `GET http://localhost:8005/health` |

---

## Error Format

All services return errors in a consistent format:

```json
{
  "detail": "Human-readable error message"
}
```

HTTP status codes follow standard conventions:
- `400` — Validation error
- `401` — Authentication required
- `403` — Insufficient permissions
- `404` — Resource not found
- `409` — Conflict (e.g., invalid state transition)
- `422` — Unprocessable entity
- `429` — Rate limit exceeded
- `500` — Internal server error (details never leaked to client)
