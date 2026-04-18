"""End-to-end ingestion pipeline (§9): parse → map columns → classify → embed → upsert."""
from __future__ import annotations

import logging
from typing import Any

from ..config import settings
from ..llm.openai_client import embed_batch
from .catalog_client import bulk_upsert_products
from .classification import classify
from .column_mapping import map_columns
from .parsing import apply_mapping, column_samples, parse_pdf_to_table, parse_tabular

log = logging.getLogger(__name__)


def _coerce_price(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        s = str(v).replace("CHF", "").replace("EUR", "").replace("'", "").replace(",", ".").strip()
        return float(s)
    except (TypeError, ValueError):
        return None


async def ingest_supplier_file(
    *, supplier_id: str, filename: str, content: bytes, default_currency: str = "CHF",
) -> dict:
    # 1. parse
    if filename.lower().endswith(".pdf"):
        df = parse_pdf_to_table(content)
    else:
        df = parse_tabular(filename, content)
    df = df.head(settings.MAX_INGEST_ROWS)
    if df.empty:
        return {"status": "empty", "rows_in": 0}

    # 2. column mapping
    cols = column_samples(df)
    mapping = await map_columns(cols)
    rows = apply_mapping(df, mapping["mappings"])

    # 3. normalise + filter incomplete
    normalised: list[dict] = []
    for r in rows:
        name = (r.get("name") or "").strip()
        if not name:
            continue
        normalised.append({
            "sku": (r.get("sku") or "").strip() or None,
            "name": name,
            "description": (r.get("description") or "").strip() or None,
            "category": (r.get("category") or "").strip() or None,
            "unit": (r.get("unit") or "pc").strip() or "pc",
            "unit_price": _coerce_price(r.get("unit_price")),
            "currency": (r.get("currency") or default_currency).upper(),
            "manufacturer": (r.get("manufacturer") or None),
            "manufacturer_sku": (r.get("manufacturer_sku") or None),
            "ean": (r.get("ean") or None),
            "image_url": r.get("image_url") or None,
        })

    if not normalised:
        return {"status": "no_valid_rows", "rows_in": len(rows), "mapping": mapping}

    # 4. classify A/B/C
    cls_resp = await classify(normalised)
    cls_by_idx = {r["input_index"]: r for r in cls_resp.get("results", [])}
    enriched: list[dict] = []
    for i, p in enumerate(normalised):
        c = cls_by_idx.get(i, {})
        material_class = c.get("material_class", "C")
        p["material_class"] = material_class
        p["classification_confidence"] = c.get("confidence")
        p["category"] = p["category"] or c.get("category")
        enriched.append(p)

    c_only = [p for p in enriched if p["material_class"] == "C"]
    excluded = [p for p in enriched if p["material_class"] != "C"]

    if not c_only:
        return {
            "status": "no_c_materials",
            "mapping": mapping,
            "rows_in": len(enriched),
            "excluded_count": len(excluded),
            "excluded_samples": [
                {"name": p["name"], "class": p["material_class"]}
                for p in excluded[:5]
            ],
        }

    # 5. embed (name + description + category)
    texts = [
        " | ".join(filter(None, [p["name"], p.get("category"), p.get("description")]))
        for p in c_only
    ]
    vectors: list[list[float]] = []
    for batch_start in range(0, len(texts), settings.EMBED_BATCH_SIZE):
        batch = texts[batch_start:batch_start + settings.EMBED_BATCH_SIZE]
        vectors.extend(await embed_batch(batch))
    for p, v in zip(c_only, vectors):
        p["embedding"] = v

    # 6. bulk upsert into catalog
    upsert_payload = [
        {
            "sku": p["sku"] or f"AUTO-{i:06d}",
            "name": p["name"],
            "description": p.get("description"),
            "category": p.get("category") or "Uncategorised",
            "unit": p.get("unit") or "pc",
            "unit_price": p.get("unit_price") or 0,
            "currency": p.get("currency") or default_currency,
            "manufacturer": p.get("manufacturer"),
            "manufacturer_sku": p.get("manufacturer_sku"),
            "ean": p.get("ean"),
            "image_url": p.get("image_url"),
            "material_class": "C",
            "embedding": p["embedding"],
        }
        for i, p in enumerate(c_only)
    ]
    upsert_result = await bulk_upsert_products(supplier_id, upsert_payload)

    return {
        "status": "ok",
        "supplier_id": supplier_id,
        "rows_in": len(enriched),
        "c_materials": len(c_only),
        "excluded": len(excluded),
        "excluded_samples": [
            {"name": p["name"], "class": p["material_class"], "reason": "non-C"}
            for p in excluded[:10]
        ],
        "mapping": mapping,
        "upsert_result": upsert_result,
    }
