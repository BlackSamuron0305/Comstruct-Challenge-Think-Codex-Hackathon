# Development Guide — comstruct C-Materials Platform

---

## Repository Structure

```
apps/
  mobile/                 # Flutter — foreman app (voice, OCR, cart, orders)
  web/                    # React + Vite + Tailwind — procurement dashboard
services/
  api-gateway/            # Fastify — RS256 JWT, rate-limit, WebSocket, proxy
  order-service/          # FastAPI — cart, orders, approval engine, state machine
  catalog-service/        # FastAPI — products, pgvector search, bulk upsert
  ai-service/             # FastAPI — LLM classification, chat, ingestion, scoring
  notification-service/   # Fastify — email (Resend) + push (FCM)
packages/
  dart-api-client/        # Generated Dart client for Flutter
  ts-shared-types/        # Shared TypeScript types & enums
infra/
  docker/init.sql         # PostgreSQL schema (5 namespaces, pgvector)
  keys/                   # RS256 JWT keypair (git-ignored)
  nginx/                  # Nginx config for mobile web
docs/                     # Project documentation
samples/                  # Demo data (acme_catalog.csv)
scripts/                  # Deployment + demo scripts
tests/                    # Integration tests
```

---

## Monorepo Tooling

| Tool | Purpose |
|------|---------|
| **Docker Compose** | Service orchestration (local + production) |
| **Turborepo** | TypeScript package build caching (`turbo.json`) |
| **Melos** | Dart/Flutter monorepo management (`melos.yaml`) |
| **pnpm** | Node.js package manager with workspace support |
| **Make** | Developer command shortcuts (`Makefile`) |

---

## Local Development Setup

### Prerequisites

| Tool | Version | Required For |
|------|---------|-------------|
| Docker Desktop | Latest | All services |
| Node.js | 20+ | Web app, gateway, notification |
| pnpm | 8+ | Node workspace management |
| Python | 3.12+ | Backend services (local dev only) |
| Flutter | 3+ | Mobile app |
| OpenSSL | Any | JWT key generation |

### First-Time Setup

```bash
# Clone
git clone https://github.com/BlackSamuron0305/Comstruct-Challenge-Think-Codex-Hackathon.git
cd Comstruct-Challenge-Think-Codex-Hackathon

# Configure environment
cp .env.example .env
# Edit .env — set OPENAI_API_KEY at minimum

# Generate JWT keys + start everything
make gen-keys
make up

# Run database migrations
make migrate

# Seed demo data
make seed
```

### Running Individual Services

```bash
# Web app (hot reload)
cd apps/web && pnpm dev

# Mobile app (Android device)
cd apps/mobile && flutter run

# Python service (local, no Docker)
cd services/ai-service && uvicorn src.main:app --reload --port 8005
```

---

## Shared Types

### TypeScript (`packages/ts-shared-types/`)

Shared enums and interfaces used by the web app, gateway, and notification service.

**Key types:**

```typescript
// Enums
OrderStatus: 'draft' | 'pending_approval' | 'approved' | 'ordered' | 'in_transit' | 'delivered' | 'rejected'
MaterialClass: 'A' | 'B' | 'C'
UserRole: 'construction_worker' | 'foreman' | 'procurement_worker'

// Models
Money, Supplier, Product, OrderItem, Order, Cart, ApprovalRule, WorkerProfile
```

Build: `pnpm --filter ts-shared-types build`

### Dart (`packages/dart-api-client/`)

Dart HTTP client and models for Flutter. Features:
- Dio-based with smart retry
- Secure token storage
- Offline cache (Hive)
- Currency normalization

---

## Testing

### Run All Tests

```bash
make test
```

### Per-Service Tests

```bash
# Order service — state machine, approval, cart, security
cd services/order-service && pytest tests/ -v

# AI service — classification, embeddings, golden tests, workflows
cd services/ai-service && pytest tests/ -v

# Catalog service — health, security headers
cd services/catalog-service && pytest tests/ -v

# Web app
cd apps/web && pnpm test
```

### Integration Tests (requires running stack)

```bash
pytest tests/test_integration.py -v
```

### Test Coverage

| Service | Coverage Areas |
|---------|---------------|
| **Order Service** | State machine transitions, approval engine (4 branches), cart workflow, security headers, query bounds, error sanitisation, auth validation |
| **AI Service** | JSON extraction, deterministic embeddings, classification heuristics, golden A-material tests, workflow logic |
| **Catalog Service** | Health, security headers |
| **Integration** | Login/refresh JWT, gateway proxy, AI chat/classify, service health |

### Golden Tests

`services/ai-service/tests/test_classifier_golden.py` — locks known classification results:
- Structural steel beam → always A-material
- Work gloves at 12 CHF → always C-material
- LED site lamp → B or C depending on price threshold

---

## Linting

```bash
make lint
```

| Tool | Scope |
|------|-------|
| **ruff** | Python services (ai-service, order-service, catalog-service) |
| **ESLint** | Web app (`apps/web`) |
| **flutter analyze** | Mobile app (`apps/mobile`) |

---

## Database Migrations

Both Python services use **Alembic** for schema migrations:

```bash
# Run all migrations
make migrate

# Or per-service:
docker compose exec order-service alembic upgrade head
docker compose exec catalog-service alembic upgrade head

# Create new migration
docker compose exec order-service alembic revision --autogenerate -m "description"
```

### Schema Namespaces

| Schema | Managed By | Tables |
|--------|-----------|--------|
| `auth` | order-service | companies, users, worker_profiles |
| `orders` | order-service | projects, orders, order_items, approval_rules |
| `catalog` | catalog-service | suppliers, products |
| `procurement` | init.sql + ai-service | supplier_scores, price_history, scrape_jobs, etc. |
| `audit` | order-service | audit_log |

---

## Code Generation

### Flutter

```bash
cd apps/mobile
flutter pub run build_runner build --delete-conflicting-outputs
```

Or via Make:
```bash
make flutter-gen
```

### TypeScript Shared Types

```bash
pnpm --filter ts-shared-types build
```

Or via Make:
```bash
make api-types
```

---

## Adding a New Service

1. Create service directory under `services/`
2. Add Dockerfile following existing patterns (non-root user, health check)
3. Add service to `docker-compose.backend.yml`
4. Add proxy route in `services/api-gateway/src/index.ts`
5. Update `CORS_ORIGIN` in `.env` if needed
6. Add health check to integration tests

---

## Environment Tips

### Hot Reload

- **Web**: Vite dev server with HMR (via Docker volume mount)
- **Mobile**: Flutter hot reload (`r` in terminal)
- **Python services**: `uvicorn --reload` in Docker

### Debugging

```bash
# View logs for a specific service
docker compose logs -f ai-service

# Enter a running container
docker compose exec order-service bash

# Check database
docker compose exec postgres psql -U comstruct_app -d comstruct

# Check Redis
docker compose exec redis redis-cli -a dev_password
```

### Common Issues

| Issue | Fix |
|-------|-----|
| JWT errors on startup | Run `make gen-keys` |
| Database tables missing | Run `make migrate` |
| No demo data | Run `make seed` |
| Port conflict | Check `docker compose ps`, stop conflicting containers |
| AI service OOM | Increase memory limit in `docker-compose.backend.yml` |
| CORS errors | Check `CORS_ORIGIN` in `.env` includes your frontend URL |
