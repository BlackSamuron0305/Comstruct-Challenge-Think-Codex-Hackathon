# comstruct C-Materials Platform

> **thinc! Hackathon — April 2026 · "Ordering for the construction site"**

End-to-end ordering platform for **C-materials** — low-value, high-variety construction site consumables (screws, gloves, foam cans, cable ties). Built for [Comstruct](https://comstruct.com), the Swiss/German construction-tech company automating procure-to-pay.

---

## Live Demo

| Surface | URL | Credentials |
|---------|-----|-------------|
| **Web Dashboard** (Procurement) | **http://35.222.179.150:8080/** | See demo accounts below |
| **Mobile Web** (Foreman) | **http://35.222.179.150:8090/** | See demo accounts below |

> Deployed on Google Compute Engine. Use any of the demo accounts after seeding.

> **⚠️ Flutter Web Limitation:** The foreman mobile app is built with Flutter, which is optimised for native Android/iOS. Some features (e.g. camera OCR, voice ordering, on-device AI, push notifications) may not work or may behave differently in the browser-based Flutter Web build. For the full experience, run the app on an **Android emulator** or deploy it to a **physical device** — see the demo video or request a live demo from our team.

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
      │   API Gateway    │  Fastify · RS256 JWT · Rate-limit · Helmet
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
| Gateway | Fastify 4 · jose (RS256 JWT) · Helmet · @fastify/rate-limit · WebSocket bridge |
| Backend | FastAPI · SQLAlchemy 2 (async) · Alembic · Pydantic v2 · LangChain |
| AI/LLM | **Hybrid LLM**: OpenAI GPT-4.1-mini · Anthropic Claude Sonnet 4.5 · Ollama gemma3:4b (edge) |
| Embeddings | OpenAI `text-embedding-3-small` (768-dim) · pgvector cosine similarity |
| NLP/ML | Statistical anomaly detection · Logistic risk scoring · ABC classification · RAG |
| Database | PostgreSQL 16 + pgvector + pg_trgm · Redis 7 (Pub/Sub + Lua atomics) |
| Storage | MinIO (S3-compatible) |
| Infra | Docker Compose · Turborepo · Melos · Makefile |

## Quickstart

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

| Service | URL |
|---------|-----|
| Web dashboard | http://localhost:8080 |
| API gateway | http://localhost:8001 |
| Order service | http://localhost:8002 |
| Catalog service | http://localhost:8003 |
| Notification service | http://localhost:8004 |
| AI service | http://localhost:8005 |
| MinIO console | http://localhost:9001 |
| PostgreSQL | `localhost:5432` |
| Redis | `localhost:6379` |

## Hackathon Deploy

For the fastest public demo deployment, use a single Google Compute Engine VM and keep the repo on that VM.

1. Create an Ubuntu VM in Google Cloud Compute Engine.
2. Install Docker and the Docker Compose plugin on the VM.
3. Clone this repo onto the VM.
4. Copy `.env.example` to `.env` and set the public host values:
   `VITE_API_BASE_URL=http://YOUR_VM_IP:8001/api`
   `VITE_WS_URL=ws://YOUR_VM_IP:8001/ws`
   `CORS_ORIGIN=http://YOUR_VM_IP:8080,http://YOUR_VM_IP:8090`
5. Run the first deploy:

```bash
make deploy-init
```

After that, updates are a one-command flow:

```bash
make deploy-update
```

That command will:
- ensure `.env` exists
- generate JWT keys if they are missing
- `git pull --ff-only`
- rebuild and restart the Docker Compose stack

Useful deployment helpers:

```bash
make deploy-status
make deploy-logs
```

To expose the Flutter foreman app in a browser too, build the Flutter web bundle on a machine with Flutter installed, then publish it with Docker Compose on the VM:

```bash
./scripts/deploy-mobile-web.sh build http://YOUR_VM_IP:8001
./scripts/deploy-mobile-web.sh publish
```

That serves the Flutter web demo at `http://YOUR_VM_IP:8090`.

If this is the first time you are targeting Flutter web, generate the missing platform scaffold once:

```bash
cd apps/mobile
flutter create --platforms=web .
```

If both browser frontends should talk to the same backend, allow both origins in `.env`:

```env
CORS_ORIGIN=http://YOUR_VM_IP:8080,http://YOUR_VM_IP:8090
```

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

## Security

All services implement defense-in-depth security controls:

- **RS256 JWT** with 15-min access + 30-day refresh tokens
- **X-Internal-Secret** gateway boundary — backend services reject direct calls
- **RBAC** enforced per-service (foreman / PM / procurement_admin), not just at gateway
- **Company isolation** — all queries scoped by `company_id`; cross-company access blocked
- **Security headers** on all services: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, CSP via Helmet
- **Rate limiting**: 200 req/min global, 10 req/min on auth endpoints
- **Input validation**: Pydantic (Python) + Zod (TypeScript) at every boundary; query params bounded
- **Bcrypt** password hashing (cost 12)
- **Non-root Docker containers** — all services run as `appuser` (UID 1000)
- **Atomic Redis operations** — cart uses Lua scripts to prevent race conditions
- **Audit logging** — structured middleware on all mutating requests
- **WebSocket auth** — message-based JWT with 10s timeout

See [docs/security-and-compliance.md](docs/security-and-compliance.md) for full GDPR posture, OWASP Top 10 mapping, and AI governance.

## Documentation

| Document | Description |
|----------|-------------|
| [docs/architecture.md](docs/architecture.md) | System architecture, service responsibilities, data flows, Mermaid diagrams |
| [docs/api-reference.md](docs/api-reference.md) | Complete API endpoint reference for all services |
| [docs/ai-workflows.md](docs/ai-workflows.md) | AI/LLM pipelines — classification, ingestion, chat, supplier scoring |
| [docs/deployment.md](docs/deployment.md) | Docker Compose setup, GCE deployment, environment configuration |
| [docs/security-and-compliance.md](docs/security-and-compliance.md) | GDPR, OWASP Top 10, security controls, AI governance |
| [docs/mobile-app.md](docs/mobile-app.md) | Flutter mobile — offline-first, voice/OCR ordering, on-device LLM |
| [docs/development-guide.md](docs/development-guide.md) | Local setup, testing, linting, monorepo tooling |
| [docs/execution-roadmap.md](docs/execution-roadmap.md) | 40-sprint delivery tracker & next-slice priorities |

## Project Structure

```
apps/
  mobile/                 # Flutter — foreman app (task search, cart, order tracking)
  web/                    # React + Vite + Tailwind — procurement dashboard
services/
  api-gateway/            # Fastify — RS256 JWT, rate-limit, WebSocket bridge, proxy
  order-service/          # FastAPI — cart, orders, approval engine, state machine, audit
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

## Key Design Decisions

- **Hybrid LLM Architecture (Cloud + Edge)** — Multi-provider orchestration: OpenAI GPT-4.1-mini, Anthropic Claude Sonnet 4.5, and Ollama gemma3:4b (local). Automatic failover with zero data egress option via on-premise Ollama. On-device Gemma 3 inference on mobile for construction-site edge AI.
- **Statistics-First Approval Engine** — Statistical demand modelling is the primary decision-maker, not static thresholds. Logistic risk scoring with recency-weighted demand forecasting and z-score anomaly detection. Static rules serve as safety guardrails only.
- **A-Material Hard Block** — Items >500 CHF or matching structural keywords (Beton, Stahl, Bewehrung, Schacht, Träger) are never classified as C-material, regardless of LLM output. Hard rules always override LLM.
- **State Machine Enforcement** — Order lifecycle (`draft → pending_approval → approved → ordered → in_transit → delivered`) enforced by a strict transition map with exhaustive tests.
- **Atomic Cart (Redis Lua)** — Cart state managed via Lua scripts for atomic read-modify-write operations. Sub-millisecond performance, 7-day TTL auto-cleanup, race-condition-free across concurrent devices.
- **Dual-Path Retrieval (Semantic + Lexical)** — Vector similarity (pgvector) for semantic understanding + trigram matching (pg_trgm) for exact Swiss-German terms, SKU codes, and brand names. Score fusion for optimal recall.
- **Confidence-Calibrated AI** — Grounded catalog matches get boosted confidence (≥0.6); ungrounded suggestions capped at 0.25. Prevents hallucinated recommendations from appearing authoritative.

## License

Hackathon project — not licensed for production use.
