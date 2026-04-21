# ai-service

AI/ML microservice for the comstruct platform. Handles document ingestion, LLM extraction, vector embeddings, supplier analysis, and conversational RAG chat.

**Port:** `8005`  
**Stack:** Python 3.12 · FastAPI · LangChain · OpenAI / Anthropic / Ollama · pgvector · asyncpg · Redis

## Responsibilities

- Document ingestion (PDF, CSV, Excel, DOCX) with OCR fallback via pytesseract
- Hybrid LLM routing: GPT-4.1-mini (cloud) ↔ gemma3:4b (on-device Ollama)
- Structured product extraction from Swiss construction quotes
- pgvector similarity search for product recommendations
- Conversational order assistant (RAG over catalog embeddings)
- Supplier scoring, ABC classification, spend anomaly detection

## Source layout

```
src/
  main.py              — FastAPI app, middleware, router registration
  routers/
    ai.py              — recommendations, product search
    chat.py            — conversational RAG endpoint
    documents.py       — document management
    ingest.py          — file upload & extraction pipeline
    suppliers.py       — supplier AI analysis
    workflows.py       — multi-step AI workflows
  llm/                 — provider abstraction (OpenAI / Anthropic / Ollama)
  prompts/             — prompt templates
  services/            — business logic (parsing, embeddings, scoring)
```

## Local development

```bash
# From repo root
cd services/ai-service
pip install -e ".[dev]"

# Requires: postgres+pgvector, redis, and a running Ollama instance (optional)
# All connection strings come from the root .env file
uvicorn src.main:app --reload --port 8005
```

Run tests:
```bash
pytest tests/ -v
```
