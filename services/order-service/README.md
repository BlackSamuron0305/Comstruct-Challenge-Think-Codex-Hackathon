# order-service

Core procurement engine. Manages shopping carts, purchase orders, multi-level approval workflows, projects, budgets, and user/company registration.

**Port:** `8002`  
**Stack:** Python 3.12 · FastAPI · SQLAlchemy (async) · asyncpg · Alembic · Redis · bcrypt

## Responsibilities

- User and company registration (bcrypt-hashed passwords)
- Shopping cart management (add, update, remove, clear)
- Order lifecycle: draft → pending_approval → approved/rejected → ordered → in_transit → delivered
- Threshold-based approval routing (`DEFAULT_APPROVAL_THRESHOLD` env var, default 200 CHF)
- Project and budget management for construction sites
- Audit log on all state-mutating operations (GDPR compliance)
- Internal auth endpoint for service-to-service calls (via `INTERNAL_SHARED_SECRET`)

## Source layout

```
src/
  main.py                  — FastAPI app, TrustedHost + audit middleware
  routers/
    orders.py              — order CRUD and status transitions
    cart.py                — shopping cart
    approvals.py           — approve / reject workflow
    projects.py            — project and budget management
    registration.py        — user and company onboarding
    internal_auth.py       — service-to-service token endpoint
  services/                — business logic layer
  scripts/
    seed_dev.py            — seed demo users and projects
```

## Local development

```bash
cd services/order-service
pip install -e ".[dev]"
uvicorn src.main:app --reload --port 8002
```

Run migrations:
```bash
alembic upgrade head
```

Run tests:
```bash
pytest tests/ -v
```
