# comstruct C-Materials Platform

> **thinc! Hackathon — April 2026 · "Ordering for the construction site"**

End-to-end ordering platform for **C-materials** — low-value, high-variety construction site consumables (screws, gloves, foam cans, cable ties). Built for [Comstruct](https://comstruct.com), the Swiss/German construction-tech company automating procure-to-pay.

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
| Mobile | Flutter 3 · Dart · Riverpod |
| Web | React 18 · TypeScript · Vite · Tailwind CSS |
| Gateway | Fastify 4 · jose (RS256 JWT) · Helmet · @fastify/rate-limit |
| Backend | FastAPI · SQLAlchemy 2 (async) · Alembic · Pydantic v2 |
| AI/LLM | Ollama (gemma3:4b, local) · pgvector embeddings |
| Database | PostgreSQL 16 + pgvector · Redis 7 |
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

See [docs/compliance.md](docs/compliance.md) for full GDPR posture, OWASP Top 10 mapping, and AI governance.

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
  compliance.md           # GDPR, OWASP Top 10, AI governance
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

## Key Design Decisions

- **Local LLM (Ollama)** — All AI inference runs on-premise via Ollama with gemma3:4b. No procurement data leaves the infrastructure. Deterministic fallback ensures the platform works without LLM.
- **A-material hard block** — Items >500 CHF or matching structural keywords (Beton, Stahl, Bewehrung, Schacht, Träger) are never classified as C-material, regardless of LLM output.
- **State machine enforcement** — Order lifecycle (`draft → pending_approval → approved → ordered → in_transit → delivered`) is enforced by a strict transition map with exhaustive tests.
- **Cart in Redis** — Atomic Lua-scripted cart operations for sub-millisecond performance. 7-day TTL auto-cleanup.
- **Approval engine** — Rule-based: per-company thresholds + restricted category lists. Auto-approve below threshold, require PM approval above.

## License

Hackathon project — not licensed for production use.
