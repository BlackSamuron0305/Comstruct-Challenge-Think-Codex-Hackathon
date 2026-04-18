"""Prompt §5.1 — column_mapper.

Given a sample of supplier-catalog rows (CSV/Excel), return a mapping
from supplier columns to canonical comstruct fields.
"""

CANONICAL_FIELDS = [
    "sku",                # supplier-internal article number
    "name",               # display name (DE preferred, EN fallback)
    "description",        # long description
    "category",           # category path (e.g. "Fasteners > Screws")
    "unit",               # unit of measure (pc, kg, m, m2, m3, l, set)
    "pack_size",          # quantity per pack (numeric)
    "unit_price",         # price per unit (numeric)
    "currency",           # ISO-4217 (CHF, EUR)
    "manufacturer",       # OEM / brand
    "manufacturer_sku",   # OEM article number
    "ean",                # GTIN / EAN-13
    "lead_time_days",     # delivery lead time
    "min_order_qty",      # minimum order quantity
    "image_url",
    "datasheet_url",
]

SYSTEM = """You are an expert at normalising construction-materials supplier catalogues for the comstruct C-Materials Platform. \
Your task is to map columns from a supplier's raw export (CSV/XLSX) to the canonical comstruct field set so they can be ingested into our catalog database. \
Only return JSON. Do not invent columns. If a supplier column has no good match, mark it skipped.\
"""

USER_TEMPLATE = """\
Canonical comstruct fields:
{fields}

Supplier source columns (with up to {n_samples} sample values per column):
{columns_block}

Return a JSON object exactly of the shape:
{{
  "mappings": [
    {{
      "source_column": "<exact source header>",
      "target_field":  "<one of the canonical fields above, or null>",
      "confidence":    <float in [0,1]>,
      "reason":        "<one short sentence>"
    }}
  ],
  "language_detected": "<de|fr|it|en|unknown>",
  "currency_detected": "<CHF|EUR|unknown>",
  "warnings": ["<free-form warnings, e.g. ambiguous columns>"]
}}

Guidelines:
- Prefer high confidence (>0.85) only when you are sure.
- German construction terms: "Bezeichnung"=name, "Artikelnummer"=sku, "Einheit"=unit, "Preis"=unit_price, "Marke"/"Hersteller"=manufacturer, "VPE"=pack_size.
- Numeric-looking columns with currency symbols imply unit_price/currency.
- Never map two source columns to the same target_field; pick the strongest match.
- Output JSON only, no prose, no markdown fences."""


def build_messages(columns: list[dict], n_samples: int = 5) -> list[dict]:
    """columns = [{"name": "Bezeichnung", "samples": ["...", ...]}, ...]"""
    blocks = []
    for c in columns:
        samples = ", ".join(repr(s) for s in (c.get("samples") or [])[:n_samples])
        blocks.append(f'  - "{c["name"]}": [{samples}]')
    user = USER_TEMPLATE.format(
        fields="\n".join(f"  - {f}" for f in CANONICAL_FIELDS),
        n_samples=n_samples,
        columns_block="\n".join(blocks),
    )
    return [
        {"role": "user", "content": user},
    ]
