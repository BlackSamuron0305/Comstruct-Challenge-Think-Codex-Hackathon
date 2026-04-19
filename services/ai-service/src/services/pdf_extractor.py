"""Shared LLM-based PDF extraction service.

Called by both the /ai/extract-pdf router and the /ingest/preview + /ingest/supplier-file
pipeline so that supplier quote PDFs are handled identically in both flows.
"""
from __future__ import annotations

import logging
from typing import Any

from ..llm.ollama_client import call_ollama_json
from .parsing import build_markdown_chunks, parse_pdf_to_markdown_pages

log = logging.getLogger(__name__)

_EXTRACTION_SYSTEM = """\
You are a precision document extraction AI for Swiss construction materials procurement. \
Extract EVERY line item (Pos) from this supplier quote (Angebot), including items marked as 'Alternative Position'.

EXTRACTION RULES:
1. Extract EVERY line item (Pos), including items marked as "Alternative Position" — set is_alternative=true for those.
2. unit_price must be the NET price per unit after all adjustments — use the unit price value shown directly in \
the document (labelled "Einheitspreis netto" or the net unit price column); do NOT derive it by dividing the \
line total by quantity, as that introduces rounding errors.
3. For "Rabatt" (discount) items: set base_discount_pct to the discount percentage (e.g. 52.0 for 52%).
4. For "TZ Zuschlag" (surcharge) items: set surcharge_pct to the surcharge percentage (e.g. 3.0 for 3%) — \
this is a positive addition to the list price.
5. list_price is the gross price before Rabatt/TZ, if shown.
6. Capture special_info as a JSON object with any extra attributes present on the item:
   - npk_code: the NPK position code (e.g. "151.412.211")
   - rabattgruppe: the discount group code (e.g. "45001")
   - manufacturer_ref: any manufacturer or cross-reference code (e.g. "Swisscom 1337435")
   - dimensions: any size/dimension info not captured in the name (e.g. "D 100 cm d1 60 cm H 100 cm W 12 cm")
   - article_ref: any "Artikel XXXXXX CREA" or similar reference
   - notes: any free-text notes on the position
7. category should use English construction terms (e.g. "cable conduit", "cable protection fitting", \
"manhole ring", "manhole cover", "warning tape", "cable pulling rope", "concrete pipe", "cable shaft", \
"paving stone", "stone slab").
8. Do NOT invent values. Use null for anything not explicitly shown.
9. If a line item spans a page break, merge it using the overlapping context.

Return JSON:
{
  "items": [{
    "name": "...",
    "sku": "...",
    "quantity": <number>,
    "unit": "...",
    "unit_price": <net price per unit, number>,
    "list_price": <gross price before discount/surcharge, number or null>,
    "base_discount_pct": <discount % as number e.g. 52.0, or null>,
    "surcharge_pct": <TZ surcharge % as number e.g. 3.0, or null>,
    "currency": "CHF",
    "category": "...",
    "is_alternative": <true if this is an Alternative Position, else false>,
    "alternative_to_pos": <pos number this is an alternative to, or null>,
    "procurement_constraint": "none",
    "required_supplier_name": null,
    "special_info": {
      "npk_code": "...",
      "rabattgruppe": "...",
      "manufacturer_ref": "...",
      "dimensions": "...",
      "article_ref": "...",
      "notes": "..."
    }
  }],
  "metadata": {
    "supplier_name": null,
    "document_date": "YYYY-MM-DD",
    "document_number": "...",
    "valid_until": "YYYY-MM-DD or null",
    "delivery_date": "YYYY-MM-DD or null",
    "total_amount": <subtotal excl. VAT, number>,
    "vat_rate": <VAT % as number e.g. 8.1, or null>,
    "vat_amount": <VAT amount or null>,
    "total_with_vat": <grand total incl. VAT or null>,
    "weight_kg": <total weight in kg or null>,
    "payment_terms": "...",
    "currency": "CHF",
    "source_locked": false,
    "contract_binding": "none",
    "mandatory_supplier_name": null
  }
}"""


async def extract_pdf_items(
    content: bytes,
    *,
    default_currency: str = "CHF",
    document_type: str = "quote",
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Extract line items and metadata from a PDF using the LLM.

    Returns:
        (items, metadata) — items is a list of product/line-item dicts,
        metadata is a dict with document-level information.
    """
    try:
        pages = parse_pdf_to_markdown_pages(content)
    except Exception as exc:
        log.warning("parse_pdf_to_markdown_pages failed: %s", exc)
        return [], {}

    if not pages:
        return [], {}

    chunks = build_markdown_chunks(pages)
    all_items: list[dict[str, Any]] = []
    merged_meta: dict[str, Any] = {}

    for chunk in chunks:
        markdown = chunk.get("markdown", "")
        page_range = chunk.get("page_range", "all")

        if not markdown.strip():
            continue

        try:
            result = await call_ollama_json(
                system=_EXTRACTION_SYSTEM,
                messages=[{
                    "role": "user",
                    "content": f"Extract all line items from pages {page_range}:\n\n{markdown}",
                }],
                max_tokens=4096,
                temperature=0.0,
            )
            if isinstance(result, dict):
                items = result.get("items") or []
                all_items.extend(items)
                if not merged_meta:
                    merged_meta = result.get("metadata") or {}
        except Exception as exc:
            log.warning("LLM extraction failed for pages %s: %s", page_range, exc)

    return all_items, merged_meta
