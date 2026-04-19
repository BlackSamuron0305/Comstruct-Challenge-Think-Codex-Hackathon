"""End-to-end ingestion pipeline (§9): parse → map columns → classify → embed → upsert."""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from ..config import settings
from ..llm.openai_client import embed_batch
from ..prompts.column_mapper import CANONICAL_FIELDS as _CANONICAL_FIELDS
from .catalog_client import bulk_upsert_products
from .classification import classify
from .column_mapping import map_columns
from .delta_detection import detect_deltas
from .parsing import apply_mapping, column_samples, parse_pdf_to_table, parse_tabular
from .pdf_extractor import extract_pdf_items

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


def _normalise_header(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").strip().lower())


def _find_column(columns: list[str], *aliases: str) -> str | None:
    normalised = {column: _normalise_header(column) for column in columns}
    for alias in aliases:
        alias_norm = _normalise_header(alias)
        for column, column_norm in normalised.items():
            if alias_norm and (column_norm == alias_norm or alias_norm in column_norm):
                return column
    return None


def _extract_pdf_rows_from_table(content: bytes, *, default_currency: str = "CHF") -> list[dict]:
    try:
        df = parse_pdf_to_table(content)
    except Exception as exc:  # noqa: BLE001
        log.warning("PDF table fallback failed: %s", exc)
        return []

    if df.empty:
        return []

    columns = [str(column) for column in df.columns]
    sku_col = _find_column(columns, "sku", "product id", "product code", "article", "artikel")
    name_col = _find_column(columns, "product name", "name", "description", "material")
    unit_col = _find_column(columns, "unit", "uom", "einheit")
    qty_col = _find_column(columns, "qty", "quantity", "menge")
    price_col = _find_column(columns, "unit price", "price", "einheitspreis", "net price")
    line_total_col = _find_column(columns, "line total", "total")

    rows: list[dict] = []
    for _, row in df.iterrows():
        sku = str(row.get(sku_col) or "").strip() if sku_col else ""
        name = str(row.get(name_col) or "").strip() if name_col else ""
        if not name and not sku:
            continue

        unit = str(row.get(unit_col) or "pc").strip() if unit_col else "pc"
        unit_price = str(row.get(price_col) or "").strip() if price_col else ""
        quantity = str(row.get(qty_col) or "").strip() if qty_col else ""
        line_total = str(row.get(line_total_col) or "").strip() if line_total_col else ""

        special_info = {
            key: value
            for key, value in {
                "quantity": quantity or None,
                "line_total": line_total or None,
            }.items()
            if value is not None
        }

        rows.append({
            "sku": sku or None,
            "name": name or sku,
            "unit": unit or "pc",
            "unit_price": unit_price or None,
            "currency": default_currency,
            "special_info": special_info or None,
        })

    return rows


def _build_upsert_payload(
    supplier_id: str,
    products: list[dict],
    *,
    default_currency: str = "CHF",
    include_embeddings: bool = False,
) -> list[dict]:
    return [
        {
            "supplier_id": supplier_id,
            "existing_product_id": p.get("existing_product_id") or p.get("matched_product_id"),
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
            **({"embedding": p.get("embedding")} if include_embeddings else {}),
        }
        for i, p in enumerate(products)
    ]


async def _embed_and_backfill(
    supplier_id: str,
    products: list[dict],
    *,
    default_currency: str = "CHF",
) -> None:
    texts = [
        " | ".join(filter(None, [p["name"], p.get("category"), p.get("description")]))
        for p in products
    ]
    if not texts:
        return

    try:
        vectors: list[list[float]] = []
        for batch_start in range(0, len(texts), settings.EMBED_BATCH_SIZE):
            batch = texts[batch_start:batch_start + settings.EMBED_BATCH_SIZE]
            vectors.extend(await embed_batch(batch))

        enriched = [dict(product) for product in products]
        for product, vector in zip(enriched, vectors):
            product["embedding"] = vector

        await bulk_upsert_products(
            supplier_id,
            _build_upsert_payload(
                supplier_id,
                enriched,
                default_currency=default_currency,
                include_embeddings=True,
            ),
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("Background embedding backfill failed for supplier %s: %s", supplier_id, exc)


def _summarise_deltas(rows: list[dict]) -> dict[str, int]:
    return {
        "new_entries": sum(1 for row in rows if row.get("delta_type") == "new_entry"),
        "price_changes": sum(1 for row in rows if row.get("delta_type") == "price_change"),
        "unchanged": sum(1 for row in rows if row.get("delta_type") == "unchanged"),
    }


async def _annotate_rows_with_deltas(rows: list[dict], *, supplier_id: str | None = None) -> tuple[list[dict], dict[str, int]]:
    if not rows or not supplier_id:
        return rows, {}
    try:
        annotated = await detect_deltas(rows, supplier_id=supplier_id)
        for row in annotated:
            delta_type = row.get("delta_type")
            if delta_type == "new_entry":
                row["import_status"] = "new"
            elif delta_type == "price_change":
                row["import_status"] = "changed"
            elif delta_type == "unchanged":
                row["import_status"] = "existing"
        return annotated, _summarise_deltas(annotated)
    except Exception as exc:  # noqa: BLE001
        log.warning("Preview delta detection failed for supplier %s: %s", supplier_id, exc)
        return rows, {}


async def preview_supplier_file(
    *, filename: str, content: bytes, mapping_overrides: list[dict] | None = None, supplier_id: str | None = None,
) -> dict:
    # PDF path: use LLM extraction first, then fall back to table parsing if needed.
    if filename.lower().endswith(".pdf"):
        items, _meta = await extract_pdf_items(content, document_type="quote")
        used_table_fallback = False
        if not items:
            items = _extract_pdf_rows_from_table(content, default_currency=str((_meta or {}).get("currency") or "CHF"))
            used_table_fallback = bool(items)
        if not items:
            return {
                "status": "empty",
                "rows_in": 0,
                "preview_rows": [],
                "prepared_rows": [],
                "source_columns": [],
                "canonical_fields": _CANONICAL_FIELDS,
                "mapping": {"mappings": [], "warnings": ["No items extracted from PDF."]},
                "pdf_metadata": _meta,
            }
        annotated_items, delta_summary = await _annotate_rows_with_deltas(items, supplier_id=supplier_id)
        warnings = ["Used PDF table fallback."] if used_table_fallback else []
        if delta_summary:
            warnings.append(
                f"Detected {delta_summary.get('new_entries', 0)} new, {delta_summary.get('price_changes', 0)} changed, and {delta_summary.get('unchanged', 0)} already-existing items."
            )
        return {
            "status": "ok",
            "rows_in": len(items),
            "preview_rows": annotated_items,
            "prepared_rows": annotated_items,
            "source_columns": [],  # empty list signals PDF mode to the frontend
            "canonical_fields": _CANONICAL_FIELDS,
            "mapping": {"mappings": [], "warnings": warnings},
            "pdf_metadata": _meta,
            "delta_summary": delta_summary,
        }

    # CSV/Excel path: pdfplumber-based tabular parsing + LLM column mapping
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
            "pdf_metadata": None,
        }

    cols = column_samples(df)
    mapping = _merge_mapping_overrides(await map_columns(cols), mapping_overrides)
    rows = apply_mapping(df, mapping.get("mappings", []))
    annotated_rows, delta_summary = await _annotate_rows_with_deltas(rows, supplier_id=supplier_id)
    preview_rows = annotated_rows[:10] if annotated_rows else df.head(10).to_dict(orient="records")
    if delta_summary:
        mapping["warnings"] = [
            *(mapping.get("warnings") or []),
            f"Detected {delta_summary.get('new_entries', 0)} new, {delta_summary.get('price_changes', 0)} changed, and {delta_summary.get('unchanged', 0)} already-existing items.",
        ]
    return {
        "status": "ok",
        "rows_in": len(df.index),
        "preview_rows": preview_rows,
        "prepared_rows": annotated_rows,
        "source_columns": cols,
        "canonical_fields": _CANONICAL_FIELDS,
        "mapping": mapping,
        "pdf_metadata": None,  # always present so API clients don't need null guards
        "delta_summary": delta_summary,
    }


async def ingest_supplier_file(
    *,
    supplier_id: str,
    filename: str,
    content: bytes,
    default_currency: str = "CHF",
    mapping_overrides: list[dict] | None = None,
    prepared_rows: list[dict] | None = None,
) -> dict:
    rows_in = 0
    mapping: dict = {"mappings": [], "warnings": []}

    # 1. parse — reuse the approved preview payload when available for a faster import.
    if prepared_rows:
        rows = [dict(row) for row in prepared_rows if isinstance(row, dict)]
        rows_in = len(rows)
        mapping = {
            "mappings": [],
            "warnings": ["Reused the approved preview rows for a faster import."],
        }
    elif filename.lower().endswith(".pdf"):
        pdf_items, _pdf_meta = await extract_pdf_items(
            content, default_currency=default_currency, document_type="quote"
        )
        if not pdf_items:
            pdf_items = _extract_pdf_rows_from_table(content, default_currency=default_currency)
            if pdf_items:
                mapping = {
                    "mappings": [],
                    "warnings": ["Used PDF table fallback for import."],
                }
        if not pdf_items:
            return {"status": "empty", "rows_in": 0}
        rows = pdf_items
        rows_in = len(rows)
    else:
        df = parse_tabular(filename, content)
        df = df.head(settings.MAX_INGEST_ROWS)
        if df.empty:
            return {"status": "empty", "rows_in": 0}
        rows_in = len(df.index)
        cols = column_samples(df)
        mapping = _merge_mapping_overrides(await map_columns(cols), mapping_overrides)
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
            "packaging_qty": _coerce_price(r.get("packaging_qty") or r.get("pack_size") or r.get("min_order_qty")) or 1,
            "unit_price": _coerce_price(r.get("unit_price")),
            "currency": (r.get("currency") or default_currency).upper(),
            "manufacturer": (r.get("manufacturer") or None),
            "manufacturer_sku": (r.get("manufacturer_sku") or None),
            "ean": (r.get("ean") or None),
            "image_url": r.get("image_url") or None,
            "special_info": _coerce_special_info(r.get("special_info") or r.get("datasheet_url")),
            "source_delivery_days": _coerce_price(r.get("source_delivery_days") or r.get("lead_time_days")),
            "must_order": _coerce_bool(r.get("must_order")) or False,
            "base_discount_pct": _coerce_price(r.get("base_discount_pct")) or 0,
            "bulk_discount_pct": _coerce_price(r.get("bulk_discount_pct")) or 0,
            "bulk_discount_threshold": _coerce_price(r.get("bulk_discount_threshold")),
            "existing_product_id": r.get("existing_product_id") or r.get("matched_product_id"),
            "matched_product_id": r.get("matched_product_id"),
            "delta_type": r.get("delta_type"),
        })

    if not normalised:
        return {"status": "no_valid_rows", "rows_in": rows_in or len(rows), "mapping": mapping}

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

    # 5. bulk upsert into catalog first so the import finishes quickly in the UI.
    upsert_payload = _build_upsert_payload(
        supplier_id,
        c_only,
        default_currency=default_currency,
        include_embeddings=False,
    )
    upsert_result = await bulk_upsert_products(supplier_id, upsert_payload)

    embedding_status = "skipped"
    if c_only:
        asyncio.create_task(
            _embed_and_backfill(
                supplier_id,
                c_only,
                default_currency=default_currency,
            ),
        )
        embedding_status = "scheduled"

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
        "embedding_status": embedding_status,
    }


async def ingest_rows_direct(
    *,
    supplier_id: str,
    rows: list[dict],
    default_currency: str = "CHF",
) -> dict:
    """Ingest pre-parsed rows from JSON — no file, no column mapping.

    Used by: external supplier API integrations, CI/CD seeding scripts,
    mobile offline queue flush. Rows must already use canonical field names.
    """
    return await ingest_supplier_file(
        supplier_id=supplier_id,
        filename="api-rows.json",  # non-.pdf triggers the prepared_rows fast-path
        content=b"",
        default_currency=default_currency,
        mapping_overrides=None,
        prepared_rows=rows,
    )
