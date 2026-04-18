# comstruct C-Materials Platform

Hackathon build for **thinc! April 2026 — "Ordering for the construction site"**.

End-to-end ordering platform for *C-materials* (low-value, high-variety construction site consumables — screws, gloves, foam cans, etc.):

- Flutter mobile app for foremen with AI-powered task search and `+/–` stepper ordering
- React web dashboard for procurement (approval queue, spend analytics, AI catalog import)
- Fastify API gateway + JWT auth + Redis-backed WebSocket order status
- Python microservices: order-service (state machine + approval engine), catalog-service (pgvector search)
- Standalone AI service (Anthropic Claude + OpenAI embeddings) for column mapping, C-material classification, and semantic search

## Quickstart

```bash
cp .env.example .env       # fill in ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.
make gen-keys              # RS256 JWT keypair
make up                    # docker compose up the full stack
make migrate               # alembic upgrade head on order + catalog
make seed                  # load 8 sample C-materials + demo users
```

| Service | URL |
|---|---|
| Web dashboard | http://localhost:5173 |
| API gateway | http://localhost:8001 |
| Order service | http://localhost:8002 |
| Catalog service | http://localhost:8003 |
| Notification service | http://localhost:8004 |
| AI service | http://localhost:8005 |
| MinIO console | http://localhost:9001 |
| Postgres | `localhost:5432` |
| Redis | `localhost:6379` |

## Demo accounts (after `make seed`)

| Role | Email | Password |
|---|---|---|
| Foreman | `foreman@brueckesg.ch` | `comstruct-demo` |
| Project manager | `pm@brueckesg.ch` | `comstruct-demo` |
| Procurement admin | `procurement@comstruct.com` | `comstruct-demo` |

## Demo flow (spec §14)

1. Procurement admin logs into web → uploads `sample.csv` → reviews AI column mapping → confirms.
2. AI classifies all rows; only C-materials are upserted to catalog.
3. Foreman opens mobile, picks project "Brücke St. Gallen", taps **Order supplies**.
4. Types *"gloves and screws for steel work"* → AI returns Work gloves ×10 + Screws TX20 ×200.
5. Cart total 25.00 EUR → **auto-approved** (below 200 CHF default threshold).
6. Adds LED site lamp ×10 (290 EUR) → triggers approval workflow; status pill flips to *Pending approval*.
7. Procurement clicks **Approve** in web → foreman receives WS update + push notification → status flips to *Approved*.

## Compliance

- All user PII stored only in `eu-central-1`. Order history retained 10 years (DE/CH/AT construction).
- RS256 JWT (60-min access, 30-day refresh rotation).
- Service-to-service calls require `X-Internal-Secret` header.
- Audit log every order state transition with actor, timestamp, IP.

See [docs/compliance.md](docs/compliance.md) for full GDPR posture, sub-processor list, and AI governance.

## Repo layout

```
apps/
  mobile/                 # Flutter — foreman app
  web/                    # React + Vite + Tailwind — procurement dashboard
services/
  api-gateway/            # Fastify + RS256 JWT + WebSocket bridge
  catalog-service/        # FastAPI + pgvector
  order-service/          # FastAPI — cart, orders, approval engine, audit
  notification-service/   # Fastify — Resend email + FCM push
  ai-service/             # FastAPI — Anthropic + OpenAI (mapping, classify, recommend)
samples/
  acme_catalog.csv        # Demo supplier catalog (mix of C + A materials)
scripts/
  demo.ps1 / demo.sh      # End-to-end smoke walk-through
docs/
  compliance.md           # GDPR & AI governance
```

## Running the demo flow

```bash
make up && make migrate && make seed
pwsh ./scripts/demo.ps1     # or:  bash ./scripts/demo.sh
```

