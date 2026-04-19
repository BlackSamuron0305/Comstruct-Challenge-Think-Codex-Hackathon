"""Calls the column-mapper prompt and returns a structured schema mapping."""
from typing import Any

from ..llm.anthropic_client import call_claude_json
from ..prompts import column_mapper as cm


def _detect_language(columns: list[dict]) -> str:
    joined = " ".join(str(c.get("name", "")) for c in columns).lower()
    if any(token in joined for token in ["bezeichnung", "einheit", "währ", "hersteller"]):
        return "de"
    if any(token in joined for token in ["designation", "prix", "devise"]):
        return "fr"
    if any(token in joined for token in ["descrizione", "valuta", "fornitore"]):
        return "it"
    return "en"


def _detect_currency(columns: list[dict]) -> str:
    joined = " ".join(
        str(value)
        for column in columns
        for value in [column.get("name", ""), column.get("sample", ""), column.get("example", "")]
    ).upper()
    for currency in ["CHF", "EUR", "USD", "GBP"]:
        if currency in joined:
            return currency
    return "unknown"


def _fallback_mapping(columns: list[dict]) -> dict:
    """Local schema matcher used when no model-backed mapping is available."""
    keymap = {
        "name": ["name", "bezeichnung", "designation", "descrizione", "item", "material"],
        "sku": ["sku", "art", "artikel", "code", "product id"],
        "unit": ["unit", "einheit", "uom", "measure"],
        "unit_price": ["price", "preis", "prix", "cost", "unit cost"],
        "currency": ["currency", "währ", "ccy", "devise", "valuta"],
        "category": ["category", "kategorie", "gruppe", "trade", "type"],
        "manufacturer": ["manufact", "hersteller", "marke", "brand", "vendor"],
    }

    mappings = []
    unresolved = 0
    for column in columns:
        chosen = None
        matched_tokens: list[str] = []
        column_name = str(column.get("name", "")).lower()
        for target, tokens in keymap.items():
            hits = [token for token in tokens if token in column_name]
            if hits:
                chosen = target
                matched_tokens = hits
                break

        if chosen is None:
            unresolved += 1

        mappings.append({
            "source_column": column.get("name"),
            "target_field": chosen,
            "confidence": 0.72 if chosen else 0.0,
            "reason": f"matched schema tokens: {', '.join(matched_tokens[:2])}" if chosen else "no schema match found",
        })

    warnings = []
    if unresolved:
        warnings.append(f"{unresolved} columns need manual review or sample rows for better mapping.")

    return {
        "mappings": mappings,
        "language_detected": _detect_language(columns),
        "currency_detected": _detect_currency(columns),
        "warnings": warnings,
    }


async def map_columns(columns: list[dict]) -> dict[str, Any]:
    return await call_claude_json(
        system=cm.SYSTEM,
        messages=cm.build_messages(columns),
        max_tokens=1500,
        temperature=0.0,
        stub=_fallback_mapping(columns),
    )
