# Comstruct C-Materials Platform

> **Codex Hackathon by Think · April 2026 · Munich**
> Challenge set by **Comstruct** — "Ordering for the construction site"

End-to-end AI-powered ordering platform for **C-materials** — low-value, high-variety construction site consumables (screws, gloves, foam cans, cable ties, PPE). Built as the winning submission for the Comstruct challenge at the Think Codex Hackathon 2026 in Munich.

The platform automates the entire procure-to-pay workflow for Swiss and German construction companies: from a foreman's voice command on a noisy site, through AI classification and supplier scoring, to procurement approval and real-time order tracking — all with an offline-first mobile app and a React web dashboard.

---

## What Was Built

A production-grade microservices platform deployed end-to-end during the hackathon. Six services, two frontends, full AI pipeline — all running in Docker Compose with real data.

### The Problem
Construction foremen waste significant time manually ordering low-value consumables from fragmented supplier catalogs. Procurement teams lack visibility, approvals are slow, and there's no intelligent purchasing guidance.

### The Solution
- **Foreman mobile app** (Flutter) — voice ordering, OCR photo capture, on-device AI, offline-first with sync
- **Procurement web dashboard** (React) — catalog management, AI-powered CSV ingestion, approval workflows, real-time order tracking
- **AI pipeline** — classifies C-materials from supplier catalogs, scores recommendations, detects anomalous orders, streams LLM responses via SSE
- **Approval engine** — statistical demand modelling with logistic risk scoring; auto-approves low-risk orders, routes high-risk to procurement

---

## Architecture

```
┌──────────────┐  ┌──────────────┐
│  Flutter App │  │ React Web    │
│  (Foreman)   │  │ (Procurement)│
└──────┬───────┘  └──────┬───────┘
       │     HTTPS/WSS   │
       └────────┬────────┘
                ▼
      ┌──────────────────┐
      │   API Gateway    │  Fastify · RS256 JWT · httpOnly cookies · Rate-limit · Helmet
      │   :8001          │  WebSocket bridge (Redis pub/sub → client)
      └──┬────┬────┬─────┘
         │    │    │   X-Internal-Secret + X-User-* headers
    ┌────┘    │    └────────┐
    ▼         ▼             ▼
┌────────┐ ┌────────┐ ┌──────────┐  ┌────────────────┐
│ Order  │ │Catalog │ │   AI     │  │ Notification   │
│Service │ │Service │ │ Service  │  │ Service        │
│:8002   │ │:8003   │ │:8005     │  │ :8004          │
│FastAPI │ │FastAPI │ │FastAPI   │  │ Fastify        │
└───┬────┘ └───┬────┘ └────┬─────┘  └────────────────┘
    │          │           │
    ▼          ▼           ▼
┌──────────────────────────────┐   ┌─────────┐  ┌─────────┐
│  PostgreSQL 16 (pgvector)    │   │  Redis  │  │  MinIO  │
│  5 schemas: auth, catalog,   │   │ Pub/Sub │  │   S3    │
│  orders, procurement, audit  │   │ + Cart  │  │  Docs   │
└──────────────────────────────┘   └─────────┘  └─────────┘
                                        ▲
                                   ┌────┘
                                   │
                              ┌─────────┐
                              │ Ollama  │
                              │gemma3:4b│
                              └─────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | Flutter 3 · Dart · Riverpod · Hive (offline queue) · Google ML Kit OCR |
| Web | React 18 · TypeScript · Vite · Tailwind CSS · Server-Sent Events |
| Gateway | Fastify 4 · jose (RS256 JWT) · httpOnly cookies · Helmet · @fastify/rate-limit · WebSocket bridge |
| Backend | FastAPI · SQLAlchemy 2 (async) · Alembic · Pydantic v2 · LangChain |
| AI/LLM | **Hybrid LLM**: OpenAI GPT-4.1-mini · Anthropic Claude Sonnet 4.5 · Ollama gemma3:4b (edge) |
| Embeddings | OpenAI `text-embedding-3-small` (768-dim) · pgvector cosine similarity |
| NLP/ML | Statistical anomaly detection · Logistic risk scoring · ABC classification · RAG |
| Database | PostgreSQL 16 + pgvector + pg_trgm · Redis 7 (Pub/Sub + Lua atomics) |
| Storage | MinIO (S3-compatible) |
| Infra | Docker Compose · Turborepo · Melos · Makefile |

---

## Quickstart (Local)

```bash
# 1. Clone and configure
git clone https://github.com/BlackSamuron0305/Comstruct-Challenge-Think-Codex-Hackathon.git
cd Comstruct-Challenge-Think-Codex-Hackathon
cp .env.example .env       # fill in API keys if using external LLMs

# 2. Generate JWT keypair & start stack
make gen-keys
make up                    # docker compose up --build -d

# 3. Run migrations & seed demo data
make migrate               # alembic upgrade head on order + catalog
make seed                  # demo users + sample C-materials
```

| Service | Local URL |
|---------|-----------|
| Web dashboard | http://localhost:8088 |
| API gateway | http://localhost:8001 |
| Order service | http://localhost:8002 |
| Catalog service | http://localhost:8003 |
| Notification service | http://localhost:8004 |
| AI service | http://localhost:8005 |
| MinIO console | http://localhost:9001 |
| PostgreSQL | `localhost:5433` |
| Redis | `localhost:6379` |

## Demo Accounts (after `make seed`)

| Role | Email | Password |
|------|-------|----------|
| Foreman | `foreman@brueckesg.ch` | `comstruct-demo` |
| Project Manager | `pm@brueckesg.ch` | `comstruct-demo` |
| Procurement Admin | `procurement@comstruct.com` | `comstruct-demo` |

## Demo Flow

1. **Procurement admin** logs into web → uploads `acme_catalog.csv` → reviews AI column mapping → confirms.
2. AI classifies all rows; only C-materials are upserted to catalog.
3. **Foreman** opens mobile, picks project "Brücke St. Gallen", taps **Order supplies**.
4. Types *"gloves and screws for steel work"* → AI returns Work Gloves ×10 + Screws TX20 ×200.
5. Cart total 25.00 CHF → **auto-approved** (below 200 CHF default threshold).
6. Adds LED site lamp ×10 (290 CHF) → triggers approval workflow; status pill flips to *Pending approval*.
7. **Procurement** clicks **Approve** in web → foreman receives WebSocket update + push notification → status flips to *Approved*.

---

## Testing

```bash
# Unit tests (no Docker required)
make test

# Or run per-service:
cd services/order-service && pytest tests/ -v    # state machine, approval, security, workflow
cd services/ai-service && pytest tests/ -v       # classification, embeddings, golden tests
cd services/catalog-service && pytest tests/ -v  # health, security

# Integration tests (requires running Docker stack)
pytest tests/test_integration.py -v              # auth, gateway proxy, AI pipeline
```

**Test coverage:**
- **Order service**: state machine transitions, approval engine (4 branches), cart workflow, security headers, query bounds, error sanitisation, auth validation
- **AI service**: JSON extraction, deterministic embeddings, classification heuristics, golden A-material tests, workflow logic
- **Catalog service**: health, security headers
- **Integration**: login/refresh JWT, gateway proxy, AI chat/classify, service health

---

## Security

All services implement defense-in-depth security controls:

- **RS256 JWT** with 15-min access tokens + 7-day refresh tokens stored in httpOnly cookies
- **Account lockout** — 5 failed attempts triggers a 15-minute lockout (Redis-backed)
- **X-Internal-Secret** gateway boundary — backend services reject direct calls
- **RBAC** enforced per-service (foreman / PM / procurement_admin), not just at gateway
- **Company isolation** — all queries scoped by `company_id`; cross-company access blocked
- **Security headers** on all services: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`, CSP via Helmet
- **Rate limiting**: 100 req/min global, 10 req/min on auth endpoints
- **Input validation**: Pydantic (Python) + Zod (TypeScript) at every boundary; query params bounded
- **Bcrypt** password hashing (cost 12)
- **Non-root Docker containers** — all services run as `appuser` (UID 1000)
- **Atomic Redis operations** — cart uses Lua scripts to prevent race conditions
- **Audit logging** — structured middleware on all mutating requests
- **WebSocket auth** — message-based JWT with 10s timeout
- **GDPR endpoints** — `GET /api/users/me/export` (data portability) and `DELETE /api/users/me` (right to erasure)

---

## Key AI & Data Science Capabilities

| Capability | Technique | Detail |
|------------|-----------|--------|
| **Retrieval-Augmented Generation (RAG)** | Dual-path hybrid search | pgvector cosine similarity + pg_trgm trigram (≥0.55) with score fusion |
| **Sigmoid-Gated Anomaly Detection** | Logistic risk function | $\text{risk} = 1/(1+e^{-(|z|-1.5)})$ with configurable threshold (0.82) |
| **Recency-Weighted Demand Forecasting** | Exponential recency bias | 65% recent 4-point mean + 35% long-term mean for expected quantities |
| **Multi-Factor Supplier Scoring** | 5-dimensional composite | Price (25%) + Delivery (25%) + Web reputation (20%) + Trust (15%) + Specs fit (15%) |
| **Multi-Modal Document Intelligence** | Vision + OCR + NLP | PDF (pdfplumber + pymupdf4llm), Excel (pandas), Images (GPT-4.1-mini Vision) |
| **Confidence-Calibrated Grounding** | Asymmetric scoring | Grounded → confidence ≥0.6; ungrounded → capped at 0.25 |
| **On-Device Edge AI** | Gemma 3 (4B) local inference | Zero-latency classification on construction sites via Android MethodChannel |
| **Offline-First with Idempotent Sync** | Hive queue + dedup keys | FIFO sync with server-side idempotency when connectivity restores |
| **Delta Detection Pipeline** | Multi-stage fuzzy matching | SKU exact → normalised name → cross-supplier with Swiss price format handling |
| **Prompt Drift Prevention** | Golden test regression suite | Pinned classification outputs block silent prompt changes in CI |
| **SSE Token Streaming** | LangChain astream / Ollama HTTP | Real-time token-by-token LLM responses via Server-Sent Events |
| **Event-Driven Architecture** | Redis Pub/Sub channels | `ai.progress`, `order.status`, `price.alert` — real-time push to all clients |
| **Atomic Cart Operations** | Redis Lua scripting | Race-condition-free read-modify-write with 7-day TTL |
| **Multilingual Alias Resolution** | 13 product groups × DE/EN | Fuzzy scoring: +3 per token, +2 per alias group for voice ordering |
| **Procurement Constraint Detection** | Regex NLP extraction | "must be purchased from" → `source_locked=True` from supplier documents |
| **Burn-Down Reorder Prediction** | Stock depletion modelling | `days_until_depleted = stock / daily_usage`; urgency: ≤3d → immediate |

---

## Key Design Decisions

- **Hybrid LLM Architecture (Cloud + Edge)** — Multi-provider orchestration: OpenAI GPT-4.1-mini, Anthropic Claude Sonnet 4.5, and Ollama gemma3:4b (local). Automatic failover with zero data egress option via on-premise Ollama. On-device Gemma 3 inference on mobile for construction-site edge AI.
- **Statistics-First Approval Engine** — Statistical demand modelling is the primary decision-maker, not static thresholds. Logistic risk scoring with recency-weighted demand forecasting and z-score anomaly detection. Static rules serve as safety guardrails only.
- **A-Material Hard Block** — Items >500 CHF or matching structural keywords (Beton, Stahl, Bewehrung, Schacht, Träger) are never classified as C-material, regardless of LLM output. Hard rules always override LLM.
- **State Machine Enforcement** — Order lifecycle (`draft → pending_approval → approved → ordered → in_transit → delivered`) enforced by a strict transition map with exhaustive tests.
- **Atomic Cart (Redis Lua)** — Cart state managed via Lua scripts for atomic read-modify-write operations. Sub-millisecond performance, 7-day TTL auto-cleanup, race-condition-free across concurrent devices.
- **Dual-Path Retrieval (Semantic + Lexical)** — Vector similarity (pgvector) for semantic understanding + trigram matching (pg_trgm) for exact Swiss-German terms, SKU codes, and brand names. Score fusion for optimal recall.
- **Confidence-Calibrated AI** — Grounded catalog matches get boosted confidence (≥0.6); ungrounded suggestions capped at 0.25. Prevents hallucinated recommendations from appearing authoritative.
- **httpOnly Cookie Auth** — Access tokens stored in httpOnly cookies (not localStorage), preventing XSS token theft. Refresh tokens scoped to `/auth` path. Account lockout enforced server-side via Redis.

---

## Project Structure

```
apps/
  mobile/                 # Flutter — foreman app (voice/OCR ordering, cart, order tracking)
  web/                    # React + Vite + Tailwind — procurement dashboard
services/
  api-gateway/            # Fastify — RS256 JWT, rate-limit, WebSocket bridge, proxy
  order-service/          # FastAPI — cart, orders, approval engine, state machine, audit, GDPR
  catalog-service/        # FastAPI — product CRUD, pgvector search, bulk upsert
  ai-service/             # FastAPI — Ollama LLM, classification, recommendations, scraper
  notification-service/   # Fastify — email (Resend) + push (FCM)
packages/
  dart-api-client/        # Generated Dart client for Flutter
  ts-shared-types/        # Shared TypeScript types
infra/
  docker/init.sql         # PostgreSQL schema (5 namespaces, pgvector)
  keys/                   # RS256 JWT keypair (git-ignored)
docs/
  architecture.md         # System architecture & data flow diagrams
  api-reference.md        # Full API endpoint documentation
  ai-workflows.md         # AI/LLM pipeline documentation
  deployment.md           # Docker & GCE deployment guide
  security-and-compliance.md  # GDPR, OWASP, security controls
  mobile-app.md           # Flutter mobile app documentation
  development-guide.md    # Local dev setup & testing
  execution-roadmap.md    # Sprint delivery tracker
samples/
  acme_catalog.csv        # Demo supplier catalog
scripts/
  demo.ps1 / demo.sh     # End-to-end smoke walk-through
tests/
  test_integration.py     # Full-stack integration tests
```

## Make Commands

| Command | Description |
|---------|-------------|
| `make up` | Build and start the full Docker stack |
| `make down` | Stop stack and remove volumes |
| `make restart` | Restart all containers |
| `make logs` | Tail all service logs |
| `make gen-keys` | Generate RS256 JWT keypair |
| `make migrate` | Run Alembic migrations (order + catalog) |
| `make seed` | Seed demo users + sample products |
| `make test` | Run all test suites |
| `make lint` | Run linters (ruff + eslint) |
| `make clean` | Full cleanup (volumes, node_modules, caches) |

---

## Hackathon Context

This project was built at the **Codex Hackathon by Think, April 2026, Munich** in response to the challenge set by **Comstruct**, the Swiss/German construction-tech company automating procure-to-pay for the construction industry.

The challenge: *build an intelligent ordering system for C-materials that a foreman can use on a noisy construction site with spotty connectivity, while giving procurement teams full control and visibility.*

The result is a fully functional, production-quality platform built over the course of the hackathon — covering mobile, web, AI pipeline, microservices backend, real-time events, and a hardened security posture.

---

## License

Hackathon project — not licensed for production use.

