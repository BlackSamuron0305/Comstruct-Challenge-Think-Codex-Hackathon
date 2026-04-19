# AI Workflows — comstruct C-Materials Platform

This document details all AI/LLM-powered pipelines in the platform.

---

## LLM Backend Configuration

The AI service supports three LLM providers, configurable via `LLM_PROVIDER` in `.env`:

| Provider | Models | Use Case |
|----------|--------|----------|
| **OpenAI** | `gpt-4.1-mini` (chat/vision), `text-embedding-3-small` (embeddings), `gpt-4o-mini-transcribe` (audio) | Default cloud provider |
| **Anthropic** | `claude-sonnet-4-5-20250514` | JSON-mode structured outputs |
| **Ollama** | `gemma3:4b` (local) | On-premise, no data leaves infrastructure |

```mermaid
graph TD
    AI[AI Service]
    AI -->|LLM_PROVIDER=openai| OPENAI[OpenAI API]
    AI -->|LLM_PROVIDER=anthropic| ANTHROPIC[Anthropic API]
    AI -->|LLM_PROVIDER=ollama| OLLAMA[Ollama Local]
    AI -->|Always| EMBED[OpenAI Embeddings<br/>text-embedding-3-small]
```

---

## 1. ABC Material Classification

Classifies products into A/B/C material classes to determine which items belong on the C-materials platform.

### Classification Flow

```mermaid
flowchart TD
    INPUT[Product Input<br/>name, category, price, description]
    HARD[Hard Rules Check]
    INPUT --> HARD

    HARD -->|"price > 500 CHF"| A_MAT[Class A — Blocked]
    HARD -->|"Structural keyword match<br/>(Beton, Stahl, Bewehrung,<br/>Schacht, Träger)"| A_MAT
    HARD -->|"No hard rule triggered"| LLM[LLM Classification]

    LLM -->|"LLM available"| LLM_RESULT[LLM Response<br/>class + confidence + reasoning]
    LLM -->|"LLM unavailable"| DETERM[Deterministic Fallback<br/>Price + category heuristics]

    LLM_RESULT --> VALIDATE[Validate Against Hard Rules]
    VALIDATE -->|"LLM says C but hard rule says A"| A_MAT
    VALIDATE -->|"Consistent"| FINAL[Final Classification]
    DETERM --> FINAL
```

### Hard Rules (Always Enforced)

| Rule | Trigger | Result |
|------|---------|--------|
| Price gate | Unit price > 500 CHF | **A-material** — never C |
| Structural keywords | Name contains: Beton, Stahl, Bewehrung, Schacht, Träger | **A-material** — never C |
| LLM override protection | LLM says C but hard rule says A | Hard rule wins |

### Deterministic Fallback (No LLM)

When the LLM is unavailable, classification uses price + category heuristics:
- PPE, Consumables, Fasteners under 50 CHF → **C**
- Tools under 100 CHF → **C**
- Everything else → **B** (manual review)

### Golden Tests

`services/ai-service/tests/test_classifier_golden.py` locks in known regression cases:
- Structural steel beam → always A
- Work gloves → always C
- LED site lamp → B or C depending on price

---

## 2. Supplier Catalog Ingestion

End-to-end pipeline for importing supplier product catalogs into the platform.

### Ingestion Pipeline

```mermaid
flowchart TD
    UPLOAD["File Upload<br/>(CSV, Excel, PDF, Image)"]
    PARSE[Parse File]
    UPLOAD --> PARSE

    PARSE -->|CSV/TSV| PANDAS[pandas DataFrame]
    PARSE -->|XLSX/XLS/ODS| PANDAS
    PARSE -->|PDF| PDFPLUMBER[pdfplumber tables<br/>+ pymupdf4llm markdown]
    PARSE -->|Image| VISION[Vision API OCR]
    PARSE -->|DOCX| DOCX_PARSE[Table extraction]

    PANDAS --> COLMAP[LLM Column Mapping]
    PDFPLUMBER --> COLMAP
    VISION --> COLMAP
    DOCX_PARSE --> COLMAP

    COLMAP --> PREVIEW[Preview for User Review]
    PREVIEW -->|User confirms| PROCESS[Row Processing Loop]

    PROCESS --> CLASSIFY[ABC Classification]
    CLASSIFY -->|A-material| SKIP[Skip — not for C-platform]
    CLASSIFY -->|B or C| EMBED[Generate Embedding<br/>text-embedding-3-small]

    EMBED --> DELTA[Delta Detection]
    DELTA -->|new_entry| UPSERT[Bulk Upsert to Catalog]
    DELTA -->|price_change| UPSERT
    DELTA -->|unchanged| SKIP2[Skip]

    UPSERT --> DONE[Ingestion Summary]

    PROCESS -.->|Progress| REDIS[Redis Pub/Sub<br/>ai.progress channel]
    REDIS -.-> WS[WebSocket → Client]
```

### Column Mapping

The LLM maps raw CSV headers to the canonical schema:

| Canonical Field | Example Raw Headers |
|-----------------|-------------------|
| `name` | Bezeichnung, Artikelname, Description, Produkt |
| `sku` | Artikelnr., SKU, Part Number, Art.Nr. |
| `price` | Preis CHF, Price, Einzelpreis, VK |
| `unit` | Einheit, Unit, Menge, VPE |
| `category` | Kategorie, Category, Warengruppe |

### Delta Detection

Compares incoming rows against existing catalog:

| Delta Type | Condition | Action |
|-----------|-----------|--------|
| `new_entry` | SKU not in catalog | Insert new product |
| `price_change` | SKU exists, price differs | Update price + flag |
| `unchanged` | SKU exists, same data | Skip |
| `skipped` | A-material classification | Do not import |

---

## 3. AI Chat Assistant

Construction-focused conversational AI grounded in the product catalog.

### Chat Flow

```mermaid
flowchart TD
    MSG[User Message]
    MSG --> EMBED_Q[Embed Query<br/>text-embedding-3-small]
    EMBED_Q --> VSEARCH[Vector Search<br/>pgvector similarity]
    MSG --> TSEARCH[Text Search<br/>pg_trgm trigram]

    VSEARCH --> DEDUP[Deduplicate Results]
    TSEARCH --> DEDUP

    DEDUP --> CONTEXT[Build Context<br/>Product catalog citations]
    CONTEXT --> LLM[LLM Generation<br/>Construction system prompt]

    LLM -->|Single turn| RESPONSE[JSON Response]
    LLM -->|Streaming| SSE[Server-Sent Events]

    RESPONSE --> CLIENT[Client Display<br/>+ Product Cards]
    SSE --> CLIENT
```

### System Prompt Focus Areas

- SIA norms (Swiss construction standards)
- EN standards (European)
- Swiss construction context (CHF, local suppliers)
- C-material procurement guidance
- Safety and PPE recommendations

### Grounding Strategy

1. User query → embedding via `text-embedding-3-small`
2. Vector similarity search in `catalog.products` (pgvector `<=>` operator)
3. Parallel text search via `pg_trgm` trigram matching
4. Deduplicate and rank results by relevance
5. Inject top products as context into LLM prompt
6. LLM generates response with catalog citations
7. Confidence scoring (0.18–0.94 range)

---

## 4. Product Recommendations

Context-aware product suggestions based on task description and project type.

```mermaid
flowchart LR
    TASK["Task Description<br/>'Installing drywall'"]
    TASK --> EMBED[Embed Task<br/>text-embedding-3-small]
    EMBED --> VECTOR[Vector Search<br/>pgvector top-N]
    VECTOR --> RANK[Rank by Relevance<br/>+ Category Boost]
    RANK --> RESPONSE["Recommended Products<br/>with scores"]
```

---

## 5. Document Extraction

AI-powered extraction from multiple document formats.

```mermaid
flowchart TD
    subgraph Input Formats
        PDF[PDF Invoice/Quote]
        EXCEL[Excel Price List]
        IMG[Photo/Scan]
        TEXT[Freeform Text<br/>WhatsApp, Notes]
    end

    PDF --> PDF_EXTRACT["pdfplumber (tables)<br/>pymupdf4llm (markdown)"]
    EXCEL --> PANDAS_EXTRACT[pandas read_excel]
    IMG --> VISION_EXTRACT["Vision API OCR<br/>(GPT-4.1-mini)"]
    TEXT --> TEXT_EXTRACT[LLM Structured Extraction]

    PDF_EXTRACT --> STRUCTURED[Structured Output<br/>products + prices + quantities]
    PANDAS_EXTRACT --> STRUCTURED
    VISION_EXTRACT --> STRUCTURED
    TEXT_EXTRACT --> STRUCTURED

    STRUCTURED --> DELTA[Delta Detection<br/>vs. Existing Catalog]
    DELTA --> PREVIEW[User Preview + Confirm]
```

---

## 6. Supplier Scoring

5-factor composite scoring engine for supplier evaluation.

### Scoring Dimensions

```mermaid
pie title Supplier Score Weights
    "Price" : 25
    "Delivery" : 25
    "Web Quality" : 20
    "Trust" : 15
    "Specs Fit" : 15
```

| Dimension | Weight | Data Source |
|-----------|--------|------------|
| **Price** (25%) | Competitive positioning vs. market average | Catalog prices, historical price_history |
| **Delivery** (25%) | Historical performance against orders | order_items delivery timestamps |
| **Trust** (15%) | Interaction history + transaction count | supplier_interactions table |
| **Web Quality** (20%) | Web search reputation + certification signals | Web scraping + search results |
| **Specs Fit** (15%) | Construction relevance + sector signals | Product category analysis |

### Scoring Flow

```mermaid
flowchart TD
    TRIGGER["Compute Score<br/>POST /suppliers/{id}/compute-score"]
    TRIGGER --> PRICE[Price Score<br/>vs. market average]
    TRIGGER --> DELIVERY[Delivery Score<br/>historical performance]
    TRIGGER --> TRUST[Trust Score<br/>interaction count + history]
    TRIGGER --> WEB[Web Quality Score<br/>search + certifications]
    TRIGGER --> SPECS[Specs Fit Score<br/>sector + category analysis]

    PRICE --> COMPOSITE[Weighted Composite<br/>0–100 scale]
    DELIVERY --> COMPOSITE
    TRUST --> COMPOSITE
    WEB --> COMPOSITE
    SPECS --> COMPOSITE

    COMPOSITE -->|"≥ 75"| AUTO["Auto-Approved<br/>(Low Risk)"]
    COMPOSITE -->|"50–74"| MANUAL["Manual Review<br/>(Medium Risk)"]
    COMPOSITE -->|"< 50"| HIGH["Manual Review Required<br/>(High Risk)"]
```

---

## 7. AI Workflows (Automated)

### Auto-Approval Workflow

```mermaid
flowchart TD
    ORDER[New Order Created]
    ORDER --> CHECK[AI Auto-Approve Evaluation]
    CHECK --> RISK[Statistical Risk Analysis<br/>z-score on quantities]
    CHECK --> CAT[Restricted Category Check]
    CHECK --> THRESHOLD[Threshold Check]

    RISK -->|"Normal demand"| PASS1[Pass]
    RISK -->|"Anomalous quantity"| FAIL1[Flag for Review]
    CAT -->|"Unrestricted"| PASS2[Pass]
    CAT -->|"Restricted category"| FAIL2[Flag for Review]
    THRESHOLD -->|"Below threshold"| PASS3[Pass]
    THRESHOLD -->|"Above threshold"| FAIL3[Flag for Review]

    PASS1 & PASS2 & PASS3 --> AUTO[Auto-Approve]
    FAIL1 --> PENDING[Pending Approval]
    FAIL2 --> PENDING
    FAIL3 --> PENDING
```

### Price Analysis Workflow

Compares current order prices against historical data to detect anomalies:
- Flags items priced significantly above historical average
- Identifies supplier price drift over time
- Suggests alternative suppliers with better pricing

### Reorder Check Workflow

Predicts material stock depletion based on historical consumption:
- Calculates average consumption rate per material per project
- Estimates days until depletion
- Suggests reorder quantities and timing

### Compliance Check Workflow

Validates orders against budgets and regulations:
- Budget remaining vs. order total
- Regulatory compliance (restricted materials)
- Project-level spending limits

---

## 8. Voice & Image Ordering (Mobile)

### Voice Order Pipeline

```mermaid
flowchart TD
    VOICE[Voice Input<br/>Speech-to-Text]
    VOICE -->|Online| WHISPER[OpenAI Whisper<br/>gpt-4o-mini-transcribe]
    VOICE -->|Offline| LOCAL_STT[On-Device STT]

    WHISPER --> TOKENS[Token Extraction<br/>Stopword filtering]
    LOCAL_STT --> TOKENS

    TOKENS --> ALIAS[Catalog Alias Resolution<br/>screws→Screws TX20<br/>gloves→Work Gloves]
    ALIAS --> MATCH[Product Matching<br/>+ Quantity Estimation]
    MATCH --> CART[Add to Cart]
```

### Image Order Pipeline

```mermaid
flowchart TD
    PHOTO[Camera Capture]
    PHOTO -->|Online| VISION[GPT-4.1-mini Vision<br/>Analyze photo]
    PHOTO -->|Offline| MLKIT[Google MLKit<br/>On-Device OCR]

    VISION --> EXTRACT[Extract Product Names<br/>+ Quantities]
    MLKIT --> EXTRACT

    EXTRACT --> MATCH[Catalog Matching]
    MATCH --> CART[Add to Cart]
```

---

## AI Governance

- All LLM responses are **suggestions only** — never auto-checkout. User explicitly confirms
- ABC classifier enforces hard rules that LLM cannot override
- Deterministic fallback ensures platform works without LLM connectivity
- Golden tests prevent silent prompt drift
- LLM sees only product names/categories/prices — never user PII or project addresses
- Local Ollama option ensures zero data leaves infrastructure
