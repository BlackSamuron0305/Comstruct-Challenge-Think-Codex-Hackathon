"""End-to-end ingestion pipeline (§9): parse → map columns → classify → embed → upsert."""
from __future__ import annotations

import logging
from typing import Any

from ..config import settings
from ..llm.openai_client import embed_batch
from ..prompts.column_mapper import CANONICAL_FIELDS as _CANONICAL_FIELDS
from .catalog_client import bulk_upsert_products
from .classification import classify
from .column_mapping import map_columns
from .parsing import apply_mapping, column_samples, parse_pdf_to_table, parse_tabular
from .pdf_extractor import extract_pdf_items

_CANONICAL_FIELDS_SET = set(_CANONICAL_FIELDS)

# Fields from LLM extraction that don't map 1:1 to canonical fields but should
# be preserved in special_info when constructing the tabular preview.
_PDF_EXTRA_FIELDS = {
    "quantity", "is_alternative", "alternative_to_pos",
    "list_price", "surcharge_pct", "procurement_constraint",
    "required_supplier_name",
}


def _items_to_preview_mapping(items: list[dict]) -> dict:
    """Build a synthetic column-mapping response from LLM-extracted items.

    The UI expects mapping.mappings = [{source_column, target_field, confidence, reason}].
    Since the LLM already returns canonical field names we pre-confirm each one.
    Extra fields (quantity, is_alternative, etc.) are routed to special_info.
    """
    # Collect every field that has at least one non-null value across all items
    present: set[str] = set()
    for item in items:
        for k, v in item.items():
            if v not in (None, "", False, [], {}):
                present.add(k)

    mappings = []
    for field in sorted(present):
        if field == "special_info":
            # Will be surfaced as a single canonical mapping
            mappings.append({
                "source_column": "special_info",
                "target_field": "special_info",
                "confidence": 1.0,
                "reason": "Extracted by AI (NPK code, Rabattgruppe, dimensions, etc.)",
            })
        elif field in _CANONICAL_FIELDS_SET:
            mappings.append({
                "source_column": field,
                "target_field": field,
                "confidence": 1.0,
                "reason": "Extracted by AI",
            })
        elif field in _PDF_EXTRA_FIELDS:
            mappings.append({
                "source_column": field,
                "target_field": "special_info",
                "confidence": 0.9,
                "reason": "Extracted by AI (stored in special_info)",
            })
    return {"mappings": mappings, "warnings": []}
from .pdf_extractor import extract_pdf_items

_CANONICAL_FIELDS_SET = set(_CANONICAL_FIELDS)

# Fields from LLM extraction that don't map 1:1 to canonical fields but should
# be preserved in special_info when constructing the tabular preview.
_PDF_EXTRA_FIELDS = {
    "quantity", "is_alternative", "alternative_to_pos",
    "list_price", "surcharge_pct", "procurement_constraint",
    "required_supplier_name",
}


def _items_to_preview_mapping(items: list[dict]) -> dict:
    """Build a synthetic column-mapping response from LLM-extracted items.

    The UI expects mapping.mappings = [{source_column, target_field, confidence, reason}].
    Since the LLM already returns canonical field names we pre-confirm each one.
    Extra fields (quantity, is_alternative, etc.) are routed to special_info.
    """
    # Collect every field that has at least one non-null value across all items
    present: set[str] = set()
    for item in items:
        for k, v in item.items():
            if v not in (None, "", False, [], {}):
                present.add(k)

    mappings = []
    for field in sorted(present):
        if field == "special_info":
            # Will be surfaced as a single canonical mapping
            mappings.append({
                "source_column": "special_info",
                "target_field": "special_info",
                "confidence": 1.0,
                "reason": "Extracted by AI (NPK code, Rabattgruppe, dimensions, etc.)",
            })
        elif field in _CANONICAL_FIELDS_SET:
            mappings.append({
                "source_column": field,
                "target_field": field,
                "confidence": 1.0,
                "reason": "Extracted by AI",
            })
        elif field in _PDF_EXTRA_FIELDS:
            mappings.append({
                "source_column": field,
                "target_field": "special_info",
                "confidence": 0.9,
                "reason": "Extracted by AI (stored in special_info)",
            })
    return {"mappings": mappings, "warnings": []}

log = logging.getLogger(__name__)

def _coerce_price(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        s = str(v).replace("CHF", "").replace("EUR", "").replace("'", "").replace("%", "").replace(",", ".").strip()
        return float(s)
    except (TypeError, ValueError):
        return None


def _coerce_bool(v: Any) -> bool | None:
    if v is None or v == "":
        return None
    if isinstance(v, bool):
        return v
    value = str(v).strip().lower()
    if value in {"1", "true", "yes", "y", "required", "must"}:
        return True
    if value in {"0", "false", "no", "n", "optional"}:
        return False
    return None


def _coerce_special_info(v: Any) -> dict | None:
    if v is None or v == "":
        return None
    if isinstance(v, dict):
        return v
    return {"note": str(v).strip()}


def _merge_mapping_overrides(mapping: dict, mapping_overrides: list[dict] | None = None) -> dict:
    if not mapping_overrides:
        return mapping

    overrides = {
        str(item.get("source_column")): item
        for item in mapping_overrides
        if item.get("source_column")
    }
    merged = []
    for entry in mapping.get("mappings", []):
        source_column = str(entry.get("source_column"))
        override = overrides.get(source_column)
        if override:
            merged.append({
                **entry,
                "target_field": override.get("target_field"),
                "confidence": override.get("confidence", 1.0),
                "reason": override.get("reason", "confirmed in UI"),
            })
        else:
            merged.append(entry)
    return {**mapping, "mappings": merged}


async def preview_supplier_file(
    *, filename: str, content: bytes, mapping_overrides: list[dict] | None = None,
) -> dict:
    # PDFs: use LLM-based structured extraction (not pdfplumber table parsing)
    if filename.lower().endswith(".pdf"):
        items, _meta = await extract_pdf_items(content)
        if not items:
            return {
                "status": "empty",
                "rows_in": 0,
                "preview_rows": [],
                "source_columns": [],
                "canonical_fields": _CANONICAL_FIELDS,
                "mapping": {"mappings": [], "warnings": ["No line items found in PDF."]},
            }
        mapping = _merge_mapping_overrides(_items_to_preview_mapping(items), mapping_overrides)
        return {
            "status": "ok",
            "rows_in": len(items),
            "preview_rows": items,  # return ALL items for PDF table view
            "source_columns": [],
            "canonical_fields": _CANONICAL_FIELDS,
            "mapping": mapping,
            "pdf_metadata": _meta,
        }

    df = parse_tabular(filename, content)
    df = df.head(settings.MAX_INGEST_ROWS)
    if df.empty:
        return {
            "status": "empty",
            "rows_in": 0,
            "preview_rows": [],
            "source_columns": [],
            "canonical_fields": _CANONICAL_FIELDS,
            "mapping": {"mappings": [], "warnings": ["No rows found in uploaded file."]},
        }

    cols = column_samples(df)
    mapping = _merge_mapping_overrides(await map_columns(cols), mapping_overrides)
    rows = apply_mapping(df, mapping.get("mappings", []))
    preview_rows = rows[:10] if rows else df.head(10).to_dict(orient="records")
    return {
        "status": "ok",
        "rows_in": len(df.index),
        "preview_rows": preview_rows,
        "source_columns": cols,
        "canonical_fields": _CANONICAL_FIELDS,
        "mapping": mapping,
    }


async def ingest_supplier_file(
    *,
    supplier_id: str,
    filename: str,
    content: bytes,
    default_currency: str = "CHF",
    mapping_overrides: list[dict] | None = None,
) -> dict:
    # 1. parse
    if filename.lower().endswith(".pdf"):
        # PDFs: use LLM-based structured extraction
        items, _meta = await extract_pdf_items(content, default_currency=default_currency)
        items = items[:settings.MAX_INGEST_ROWS]
        if not items:
            return {"status": "empty", "rows_in": 0}
        rows = items
        mapping: dict = {"mappings": [], "warnings": []}
    else:
        df = parse_tabular(filename, content)
        df = df.head(settings.MAX_INGEST_ROWS)
        if df.empty:
            return {"status": "empty", "rows_in": 0}

        # 2. column mapping
        cols = column_samples(df)
        mapping = _merge_mapping_overrides(await map_columns(cols), mapping_overrides)
        rows = apply_mapping(df, mapping["mappings"])

    # 3. normalise + filter incomplete
    normalised: list[dict] = []
    for r in rows:
        name = (r.get("name") or "").strip()
        if not name:
            continue
        # Merge PDF-specific extra fields into special_info so nothing is lost
        base_special = _coerce_special_info(r.get("special_info") or r.get("datasheet_url")) or {}
        for extra_field in ("is_alternative", "alternative_to_pos", "list_price", "surcharge_pct", "quantity"):
            val = r.get(extra_field)
            if val not in (None, "", False):
                base_special[extra_field] = val
        normalised.append({
            "sku": (r.get("sku") or "").strip() or None,
            "name": name,
            "description": (r.get("description") or "").strip() or None,
            "category": (r.get("category") or "").strip() or None,
            "unit": (r.get("unit") or "pc").strip() or "pc",
            "packaging_qty": _coerce_price(r.get("packaging_qty") or r.get("pack_size") or r.get("min_order_qty")) or 1,
            "unit_price": _coerce_price(r.get("unit_price")),
            "currency": (r.get("currency") or default_currency).upper(),
            "manufacturer": (r.get("manufacturer") or None),
            "manufacturer_sku": (r.get("manufacturer_sku") or None),
            "ean": (r.get("ean") or None),
            "image_url": r.get("image_url") or None,
            "special_info": base_special or None,
            "source_delivery_days": _coerce_price(r.get("source_delivery_days") or r.get("lead_time_days")),
            "must_order": _coerce_bool(r.get("must_order")) or False,
            "base_discount_pct": _coerce_price(r.get("base_discount_pct")) or 0,
            "bulk_discount_pct": _coerce_price(r.get("bulk_discount_pct")) or 0,
            "bulk_discount_threshold": _coerce_price(r.get("bulk_discount_threshold")),
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
        p["taxonomy_code"] = c.get("taxonomy_code")
        p["taxonomy_label"] = c.get("taxonomy_label")
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
            "supplier_id": supplier_id,
            "sku": p["sku"] or f"AUTO-{i:06d}",
            "name": p["name"],
            "description": p.get("description"),
            "category": p.get("category") or "Uncategorised",
            "taxonomy_code": p.get("taxonomy_code"),
            "taxonomy_label": p.get("taxonomy_label"),
            "unit": p.get("unit") or "pc",
            "packaging_qty": p.get("packaging_qty") or 1,
            "unit_price": p.get("unit_price") or 0,
            "currency": p.get("currency") or default_currency,
            "manufacturer": p.get("manufacturer"),
            "manufacturer_sku": p.get("manufacturer_sku"),
            "ean": p.get("ean"),
            "image_url": p.get("image_url"),
            "special_info": p.get("special_info"),
            "source_delivery_days": p.get("source_delivery_days"),
            "must_order": p.get("must_order") or False,
            "base_discount_pct": p.get("base_discount_pct") or 0,
            "bulk_discount_pct": p.get("bulk_discount_pct") or 0,
            "bulk_discount_threshold": p.get("bulk_discount_threshold"),
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
