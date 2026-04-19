# Architecture — comstruct C-Materials Platform

## System Overview

The platform follows a **microservices architecture** with six services communicating via REST (internal) and WebSocket (client real-time updates), all behind a single API gateway. Data is stored in PostgreSQL 16 with pgvector, Redis for caching/pub-sub, and MinIO for S3-compatible object storage.

```mermaid
graph TB
    subgraph Clients
        MOBILE["Flutter Mobile App<br/>(Foreman)"]
        WEB["React Web Dashboard<br/>(Procurement)"]
    end

    subgraph Gateway
        GW["API Gateway<br/>Fastify :8001<br/>RS256 JWT · Rate-limit · Helmet"]
    end

    subgraph Backend Services
        ORDER["Order Service<br/>FastAPI :8002"]
        CATALOG["Catalog Service<br/>FastAPI :8003"]
        NOTIF["Notification Service<br/>Fastify :8004"]
        AI["AI Service<br/>FastAPI :8005"]
    end

    subgraph Data Layer
        PG["PostgreSQL 16<br/>pgvector<br/>5 schemas"]
        REDIS["Redis 7<br/>Pub/Sub + Cart"]
        MINIO["MinIO<br/>S3 Storage"]
    end

    subgraph AI Runtime
        OLLAMA["Ollama<br/>gemma3:4b"]
        OPENAI["OpenAI API<br/>GPT-4.1-mini"]
    end

    MOBILE -->|HTTPS/WSS| GW
    WEB -->|HTTPS/WSS| GW
    GW -->|X-Internal-Secret| ORDER
    GW -->|X-Internal-Secret| CATALOG
    GW -->|X-Internal-Secret| NOTIF
    GW -->|X-Internal-Secret| AI
    GW <-->|Pub/Sub| REDIS

    ORDER --> PG
    ORDER --> REDIS
    CATALOG --> PG
    AI --> OLLAMA
    AI --> OPENAI
    AI --> PG
    AI --> REDIS
    NOTIF -.->|Resend| EMAIL["Email"]
    NOTIF -.->|FCM| PUSH["Push"]
```

---

## Service Responsibilities

### API Gateway (`services/api-gateway/`)

**Tech**: Fastify 4 · TypeScript · jose (RS256 JWT) · Helmet · @fastify/rate-limit

| Responsibility | Detail |
|----------------|--------|
| Authentication | RS256 JWT issuance (60-min access, 30-day refresh). Login / register / refresh |
| Authorization | Verifies JWT on every `/api/*` request, injects `X-User-Id`, `X-User-Role`, `X-Company-Id` |
| Proxy | Routes to backend services by path prefix |
| WebSocket bridge | Subscribes to Redis pub/sub, pushes real-time events to authenticated clients |
| Security | Helmet headers, CORS whitelist, rate limiting (200/min global, 10/min auth), body size limit |

**Proxy Routing Map:**

```mermaid
graph LR
    GW[API Gateway :8001]
    GW -->|"/api/orders, /api/cart,<br/>/api/projects, /api/approvals"| ORDER[Order Service :8002]
    GW -->|"/api/products,<br/>/api/suppliers, /api/categories"| CATALOG[Catalog Service :8003]
    GW -->|"/api/ai, /api/ingest,<br/>/api/supplier-scoring"| AI[AI Service :8005]
    GW -->|"/notify, /push"| NOTIF[Notification Service :8004]
```

### Order Service (`services/order-service/`)

**Tech**: FastAPI · SQLAlchemy 2 (async) · Alembic · Pydantic v2

- **Cart**: Redis hash-per-user with atomic Lua-scripted add/remove. 7-day TTL
- **Checkout**: Validates project ownership, snapshots product prices, creates order + items
- **Approval engine**: Rule-based per-company threshold + restricted categories + statistical anomaly detection
- **State machine**: Strict transition enforcement across 7 states
- **Audit log**: Every state transition recorded with actor, timestamp, before/after state
- **Auth**: User registration, credential verification (bcrypt), user lookup

### Catalog Service (`services/catalog-service/`)

**Tech**: FastAPI · SQLAlchemy 2 · pgvector · Alembic

- **Products**: CRUD + bulk upsert from CSV / ingestion pipeline
- **Semantic search**: `SELECT ... ORDER BY embedding <=> $query_vector LIMIT N`
- **Taxonomy**: Rules-based product classification (Tools, Fasteners, PPE, Electrical, Consumables, Concrete)
- **Delivery analytics**: Historical delivery performance tracking per product and supplier
- **Supplier recommendations**: Weighted scoring (60% price, 40% delivery)

### AI Service (`services/ai-service/`)

**Tech**: FastAPI · OpenAI / Anthropic / Ollama · httpx

- **Classification**: ABC material classifier with deterministic hard rules + LLM assist
- **Recommendations**: Context-aware product suggestions from vector + text search
- **Chat**: Construction-focused Q&A grounded in catalog data, with SSE streaming
- **Document extraction**: PDF, Excel, CSV, image parsing with AI column mapping
- **Ingestion**: Supplier catalog processing pipeline with delta detection
- **Supplier scoring**: 5-factor composite scoring (price, delivery, trust, web quality, specs fit)
- **Web scraping**: Supplier catalog scraping and web search

### Notification Service (`services/notification-service/`)

**Tech**: Fastify · TypeScript

- **Email**: Transactional email via Resend (approval notifications, order confirmations)
- **Push**: Firebase Cloud Messaging for mobile push notifications
- **Templates**: Event-based (`order_pending_approval`, `order_approved`, `order_rejected`, `order_delivered`)

---

## Data Flow Diagrams

### Cart → Checkout → Approval

```mermaid
sequenceDiagram
    participant F as Foreman (Mobile)
    participant GW as API Gateway
    participant OS as Order Service
    participant CS as Catalog Service
    participant R as Redis
    participant NS as Notification Service

    F->>GW: POST /api/cart/add {product_id, qty}
    GW->>OS: Proxy + auth headers
    OS->>R: HSET cart:user_id (Lua atomic)
    OS-->>F: 200 OK

    F->>GW: POST /api/orders/checkout {project_id}
    GW->>OS: Proxy + auth headers
    OS->>CS: GET /internal/products (snapshot prices)
    CS-->>OS: Product data
    OS->>OS: Create order + items (PostgreSQL)
    OS->>OS: Run approval engine

    alt Total below threshold
        OS->>OS: Auto-approve → status: approved
    else Total above threshold
        OS->>OS: Status: pending_approval
        OS->>R: PUBLISH approval.{company_id}
        OS->>NS: POST /notify (email + push to PM)
    end

    OS->>R: PUBLISH order.status.{id}
    OS->>R: DEL cart:user_id
    R-->>GW: Pub/Sub event
    GW-->>F: WebSocket push
```

### CSV Ingestion Pipeline

```mermaid
sequenceDiagram
    participant P as Procurement (Web)
    participant GW as API Gateway
    participant AI as AI Service
    participant CS as Catalog Service
    participant R as Redis

    P->>GW: POST /api/ingest/supplier-file (CSV)
    GW->>AI: Proxy + auth headers
    AI->>AI: Parse CSV/Excel
    AI->>AI: LLM column mapping
    AI->>R: PUBLISH ai.progress (10%)

    loop For each row
        AI->>AI: ABC classification
        AI->>AI: Generate embedding
        AI->>AI: Delta detection
        AI->>R: PUBLISH ai.progress (N%)
    end

    AI->>CS: POST /internal/products/bulk-upsert
    CS-->>AI: Upsert result
    AI->>R: PUBLISH ai.progress (100%)
    R-->>GW: Pub/Sub event
    GW-->>P: WebSocket progress
    AI-->>P: Ingestion summary
```

### Order State Machine

```mermaid
stateDiagram-v2
    [*] --> draft
    draft --> pending_approval: Total ≥ threshold OR restricted category
    draft --> approved: Total below threshold (auto-approve)
    pending_approval --> approved: PM approves
    pending_approval --> rejected: PM rejects
    approved --> ordered: Supplier confirmed
    ordered --> in_transit: Shipped
    ordered --> delivered: Direct delivery
    in_transit --> delivered: Arrived on site
    delivered --> [*]
    rejected --> [*]
```

### Authentication Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant GW as API Gateway
    participant OS as Order Service

    C->>GW: POST /auth/login {email, password}
    GW->>OS: POST /internal/auth/verify-credentials
    OS->>OS: bcrypt.verify(password, hash)
    OS-->>GW: {user} or 401
    GW->>GW: Sign RS256 JWT (access 60m + refresh 30d)
    GW-->>C: {access_token, refresh_token, user}

    C->>GW: GET /api/* + Authorization Bearer
    GW->>GW: Verify RS256 signature
    GW->>GW: Inject X-User-Id, X-User-Role, X-Company-Id
    GW->>OS: Forward + X-Internal-Secret
    OS->>OS: Validate X-Internal-Secret
    OS-->>GW: Response
    GW-->>C: Response
```

---

## WebSocket Real-Time Events

```mermaid
graph LR
    subgraph Backend
        OS[Order Service]
        AI[AI Service]
    end

    subgraph Broker
        R[Redis Pub/Sub]
    end

    subgraph Gateway
        WS[WebSocket Bridge]
    end

    subgraph Clients
        MOB[Mobile App]
        DASH[Web Dashboard]
    end

    OS -->|"order.status.*"| R
    OS -->|"approval.*"| R
    AI -->|"ai.progress.*"| R
    AI -->|"price.alert.*"| R

    R --> WS
    WS -->|Status updates| MOB
    WS -->|Approvals, progress| DASH
```

| Channel Pattern | Event | Consumer |
|----------------|-------|----------|
| `order.status.{id}` | Per-order status transitions | Foreman (mobile) |
| `order.status` | All company order broadcasts | Procurement (web) |
| `approval.{company_id}` | Approval requests/decisions | PM (web/mobile) |
| `ai.progress.{job_id}` | Ingestion/scraping progress | Procurement (web) |
| `price.alert.{company}` | Price change alerts | Procurement (web) |
| `sync.{user_id}` | Offline sync notifications | Foreman (mobile) |

**Auth**: Message-based JWT (`{"type":"auth","token":"<jwt>"}`) with 10-second timeout. Legacy URL `?token=` also supported.

---

## Database Schema

PostgreSQL 16 with extensions: `pgvector`, `uuid-ossp`, `pg_trgm`

```mermaid
erDiagram
    auth_companies ||--o{ auth_users : has
    auth_users ||--o| auth_worker_profiles : has
    auth_companies ||--o{ orders_projects : has
    orders_projects ||--o{ orders_orders : contains
    auth_users ||--o{ orders_orders : places
    orders_orders ||--o{ orders_order_items : contains
    catalog_suppliers ||--o{ catalog_products : supplies
    catalog_products ||--o{ orders_order_items : "referenced by"
    auth_companies ||--o{ orders_approval_rules : configures

    auth_companies {
        uuid id PK
        string name
        string domain
    }
    auth_users {
        uuid id PK
        uuid company_id FK
        string email
        string password_hash
        string role
        string full_name
    }
    auth_worker_profiles {
        uuid user_id FK
        string trade
        string language
        string glove_size
        string device_token
    }
    orders_projects {
        uuid id PK
        uuid company_id FK
        string name
        string site_address
        string trade
        bool is_active
    }
    orders_orders {
        uuid id PK
        uuid user_id FK
        uuid project_id FK
        string status
        decimal total_amount
        string currency
        uuid approved_by
        timestamp approved_at
        string rejection_reason
    }
    orders_order_items {
        uuid id PK
        uuid order_id FK
        uuid product_id FK
        int quantity
        decimal unit_price
        string product_name_snapshot
    }
    orders_approval_rules {
        uuid id PK
        uuid company_id FK
        decimal threshold_amount
        bool auto_approve_below
        jsonb restricted_categories
        string approver_role
    }
    catalog_suppliers {
        uuid id PK
        string name
        string email
        string phone
        bool supports_api
        bool supports_documents
    }
    catalog_products {
        uuid id PK
        uuid supplier_id FK
        string name
        string sku
        string category
        decimal price
        string currency
        string unit
        string material_class
        vector embedding
        float expected_delivery_days
        float delivery_confidence
    }
```

| Schema | Key Tables | Purpose |
|--------|-----------|---------|
| `auth` | `companies`, `users`, `worker_profiles` | Identity & access |
| `catalog` | `suppliers`, `products` (with `embedding vector(768)`) | Product catalog |
| `orders` | `projects`, `orders`, `order_items`, `approval_rules` | Order lifecycle |
| `procurement` | `supplier_scores`, `price_history`, `supplier_interactions`, `scrape_jobs`, `web_search_cache`, `preferred_suppliers`, `supplier_proposals`, `approved_suppliers` | Procurement intelligence |
| `audit` | `audit_log` | Immutable audit trail |

---

## Security Architecture

```mermaid
graph TB
    subgraph Internet
        CLIENT[Client Browser / App]
    end

    subgraph Public Surface
        GW["API Gateway<br/>Helmet · Rate limiting · RS256 JWT<br/>CORS · Body size limit"]
    end

    subgraph Docker Network Only
        BACKEND["Backend Services<br/>X-Internal-Secret · RBAC · company_id isolation<br/>Security headers · Pydantic validation<br/>SQLAlchemy parameterised · Non-root UID 1000<br/>Audit logging"]
    end

    CLIENT -->|"HTTPS + JWT"| GW
    GW -->|"Docker internal + X-Internal-Secret"| BACKEND
```

---

## Docker Compose Topology

| File | Services | Purpose |
|------|----------|---------|
| `docker-compose.yml` | — | Orchestrator (includes all) |
| `docker-compose.infra.yml` | PostgreSQL, Redis, MinIO | Data layer |
| `docker-compose.backend.yml` | API Gateway, Order, Catalog, AI, Notification | Application services |
| `docker-compose.frontend.yml` | Web (Vite), Mobile Web (nginx) | Client apps |

```mermaid
graph TB
    subgraph "docker-compose.infra.yml"
        PG["PostgreSQL 16 :5432"]
        REDIS["Redis 7 :6379"]
        MINIO["MinIO :9000/:9001"]
    end

    subgraph "docker-compose.backend.yml"
        GW["API Gateway :8001"]
        ORDER["Order Service :8002"]
        CATALOG["Catalog Service :8003"]
        NOTIF["Notification :8004"]
        AI["AI Service :8005"]
    end

    subgraph "docker-compose.frontend.yml"
        WEB["React Web :8080"]
        MOBWEB["Mobile Web :8090"]
    end

    GW --> ORDER
    GW --> CATALOG
    GW --> AI
    GW --> NOTIF
    ORDER --> PG
    ORDER --> REDIS
    CATALOG --> PG
    AI --> PG
    AI --> REDIS
    WEB --> GW
    MOBWEB --> GW
```
# Architecture — comstruct C-Materials Platform

## System Overview

The platform is a microservices architecture designed for construction-site C-material procurement. Six services communicate via REST (internal) and WebSocket (client real-time updates), all behind a single API gateway.

## Service Responsibilities

### API Gateway (`services/api-gateway/`)
**Tech**: Fastify 4 · TypeScript · jose (RS256 JWT) · Helmet · @fastify/rate-limit

- **Authentication**: RS256 JWT issuance (15-min access, 30-day refresh). Login/register/refresh endpoints.
- **Authorization**: Verifies JWT on every `/api/*` request, injects `X-User-Id`, `X-User-Role`, `X-Company-Id` headers downstream.
- **Proxy**: Routes `/api/orders/*` → order-service, `/api/catalog/*` → catalog-service, `/api/ai/*` → ai-service.
- **WebSocket bridge**: Subscribes to Redis pub/sub channels, pushes real-time events (order status, approvals, AI progress) to authenticated clients.
- **Security**: Helmet headers, CORS whitelist, rate limiting (200/min global, 10/min auth), request body size limit.

### Order Service (`services/order-service/`)
**Tech**: FastAPI · SQLAlchemy 2 (async) · Alembic · Pydantic v2

- **Cart**: Redis hash-per-user with atomic Lua-scripted add/remove. 7-day TTL.
- **Checkout**: Validates project ownership, snapshots product prices from catalog-service, creates order + items.
- **Approval Engine**: Rule-based. Per-company threshold + restricted categories. Auto-approve below threshold.
- **State Machine**: `draft → pending_approval → approved → ordered → in_transit → delivered`. Strict transition enforcement.
- **Audit Log**: Every state transition recorded with actor, timestamp, before/after state.
- **Internal Auth**: User registration, credential verification (bcrypt), user lookup — called only by gateway.

### Catalog Service (`services/catalog-service/`)
**Tech**: FastAPI · SQLAlchemy 2 · pgvector · Alembic

- **Products**: CRUD + bulk upsert (from CSV ingestion). Each product has a pgvector embedding for semantic search.
- **Semantic Search**: `SELECT ... ORDER BY embedding <=> $query_vector LIMIT N` — finds products by natural language.
- **Categories**: Aggregated category list for filtering.
- **Suppliers**: Supplier profile management.

### AI Service (`services/ai-service/`)
**Tech**: FastAPI · Ollama (gemma3:4b) · httpx

- **Classification**: ABC material classifier with hard rules (>500 CHF or structural keywords → never C). Deterministic fallback when LLM unavailable.
- **Recommendations**: Context-aware product suggestions based on task description + project type.
- **Chat**: Conversational AI for procurement questions, with optional project context.
- **Ingestion**: CSV column mapping via LLM, product extraction, embedding generation.
- **Workflows**: Auto-approval evaluation, risk assessment, compliance checks.
- **Scraper**: Web scraper for supplier price lists, stores to `procurement.scrape_jobs`.

### Notification Service (`services/notification-service/`)
**Tech**: Fastify · TypeScript

- **Email**: Transactional email via Resend (approval notifications, order confirmations).
- **Push**: Firebase Cloud Messaging for mobile push notifications.

## Data Flow

### Cart → Checkout → Approval

```
Foreman (mobile)
  │
  ├─ POST /api/cart/add  ────────────────►  Redis HSET (Lua atomic)
  ├─ GET  /api/cart      ────────────────►  Redis HGETALL
  │
  ├─ POST /api/orders/checkout ──────────►  Order Service:
  │                                          1. Validate project ownership (company_id)
  │                                          2. Fetch product snapshots from Catalog Service
  │                                          3. CREATE order + items (PostgreSQL)
  │                                          4. Run approval engine:
  │                                             - Below threshold → auto-approve
  │                                             - Above threshold → pending_approval
  │                                          5. Publish to Redis (order.status.{id})
  │                                          6. Clear cart (Redis)
  │                                          7. Notify (email + push)
  │
  └─ WebSocket ◄──── Redis pub/sub ◄──── order.status.{id}
```

### CSV Ingestion

```
Procurement (web)
  │
  ├─ POST /api/ai/ingest/upload  ────────►  AI Service:
  │                                          1. Parse CSV
  │                                          2. LLM column mapping
  │                                          3. Return mapped preview
  │
  ├─ POST /api/ai/ingest/confirm ────────►  AI Service:
  │                                          1. Classify each row (A/B/C)
  │                                          2. Generate embeddings
  │                                          3. Bulk upsert C-materials → Catalog Service
  │                                          4. Return summary
  │
  └─ WebSocket ◄──── ai.progress channel
```

## Database Schema

PostgreSQL 16 with pgvector extension. Five namespaces:

| Schema | Tables | Purpose |
|--------|--------|---------|
| `auth` | `companies`, `users`, `worker_profiles` | Identity & access |
| `catalog` | `suppliers`, `products` (with `embedding vector(768)`) | Product catalog |
| `orders` | `projects`, `orders`, `order_items`, `approval_rules` | Order lifecycle |
| `procurement` | `supplier_scores`, `price_history`, `supplier_interactions`, `scrape_jobs` | Procurement intelligence |
| `audit` | `audit_log` | Immutable audit trail |

## Authentication Flow

```
Client → POST /auth/login { email, password }
  └─► Gateway → POST /internal/auth/verify-credentials → Order Service
       └─► bcrypt.verify(password, hash) → { user } or 401
  └─► Gateway signs RS256 JWT (access 15m + refresh 30d)
  └─► Returns { access_token, refresh_token, user }

Client → GET /api/* { Authorization: Bearer <access_token> }
  └─► Gateway verifies RS256 signature
  └─► Injects X-User-Id, X-User-Role, X-Company-Id, X-Internal-Secret
  └─► Proxies to backend service

Backend → Checks X-Internal-Secret matches config
       → Reads X-User-* headers as trusted identity
```

## Real-Time Events (WebSocket)

The gateway bridges Redis pub/sub to WebSocket clients:

| Channel Pattern | Event | Consumer |
|----------------|-------|----------|
| `order.status.{id}` | Status transitions | Foreman (mobile) |
| `order.status` | All status updates | Procurement (web) |
| `approval.{company_id}` | Approval requests | PM (web/mobile) |
| `ai.progress.{session}` | Ingestion progress | Procurement (web) |
| `price.alert.{company}` | Price change alerts | Procurement (web) |

Auth: message-based JWT (`{"type":"auth","token":"<jwt>"}`) with 10s timeout. Legacy URL `?token=` supported for backward compatibility.

## Security Architecture

```
Internet
  │
  ▼
┌─────────────────────────────────────┐
│ API Gateway (public surface)        │
│ • Helmet (CSP, HSTS, X-Frame-Options)│
│ • Rate limiting (200/min, 10/min auth)│
│ • RS256 JWT verification             │
│ • CORS whitelist                     │
│ • Request body size limit            │
└───────────────┬─────────────────────┘
                │ Docker network only
                │ X-Internal-Secret header
                ▼
┌─────────────────────────────────────┐
│ Backend Services                     │
│ • Reject without X-Internal-Secret   │
│ • RBAC per endpoint (require_role)   │
│ • Company isolation (company_id)     │
│ • Security headers (nosniff, DENY)   │
│ • Pydantic input validation          │
│ • SQLAlchemy (parameterised queries) │
│ • Non-root containers (UID 1000)     │
│ • Audit logging middleware           │
└─────────────────────────────────────┘
```

## Deployment

```bash
# Development
make up          # Docker Compose with hot-reload

# The stack includes:
# - PostgreSQL 16 + pgvector
# - Redis 7
# - MinIO (S3)
# - Ollama (gemma3:4b)
# - 5 application services
# - Web frontend (Vite dev server)
```

Docker Compose files are split for modularity:
- `docker-compose.yml` — orchestrator (includes all)
- `docker-compose.infra.yml` — databases, Redis, MinIO, Ollama
- `docker-compose.backend.yml` — API gateway + microservices
- `docker-compose.frontend.yml` — Web + mobile (future)
