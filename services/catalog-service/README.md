# catalog-service

Product catalog and supplier directory. Manages products, categories, and suppliers with pgvector-powered semantic search and AI-populated embeddings.

**Port:** `8003`  
**Stack:** Python 3.12 · FastAPI · SQLAlchemy (async) · asyncpg · Alembic · pgvector

## Responsibilities

- CRUD for products, categories, and suppliers
- Vector similarity search over product embeddings (populated by ai-service)
- Bulk-upsert endpoint for AI-driven catalog population from ingested documents
- Category taxonomy helpers for Swiss construction materials (NPK codes)
- Product recommendation by cosine similarity

## Source layout

```
src/
  main.py               — FastAPI app, CORS restricted to api-gateway
  routers/
    products.py         — product CRUD, vector search, bulk-upsert
    suppliers.py        — supplier CRUD
  models/               — SQLAlchemy ORM models
  recommendations.py    — vector-based product recommendations
  taxonomy.py           — category / NPK code helpers
  scripts/
    seed_dev.py         — seed demo products and categories
```

## Local development

```bash
cd services/catalog-service
pip install -e ".[dev]"
uvicorn src.main:app --reload --port 8003
```

Run migrations:
```bash
alembic upgrade head
```

Run tests:
```bash
pytest tests/ -v
```
