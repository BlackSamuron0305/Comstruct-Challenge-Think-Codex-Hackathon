"""Prompt §5.1 — product_row_extractor.

Given a supplier document already transformed into markdown, extract the
actual product rows into canonical comstruct fields.
"""

CANONICAL_FIELDS = [
    "sku",                     # supplier article number / product code
    "name",                    # product display name
    "description",             # long description
    "category",                # trade/category label
    "unit",                    # unit of measure (pcs, box, roll, m, kg, pair, ...)
    "packaging_qty",           # pack size / units per pack when explicitly shown
    "unit_price",              # price per unit
    "currency",                # ISO-4217 (CHF, EUR)
    "manufacturer",            # brand / OEM
    "manufacturer_sku",        # OEM article number
    "ean",                     # GTIN / EAN-13
    "image_url",               # product image URL
    "special_info",            # extra details, notes, dimensions, finish, contract-only notes
    "source_delivery_days",    # supplier-stated delivery time in days
    "must_order",              # mandatory / required / pallet-only ordering flag
    "base_discount_pct",       # default discount percentage
    "bulk_discount_pct",       # volume discount percentage
    "bulk_discount_threshold", # quantity threshold for bulk pricing
]

SYSTEM = """You extract structured product rows from construction supplier documents.

Input is markdown converted from PDF, Excel, OCR, or similar sources.

Your job:
Extract ONLY real product rows and normalize them into the given canonical schema.

Hard rules:
- Output ONLY valid JSON.
- Return one object per product row.
- Do NOT return headers.
- Do NOT return totals, subtotals, VAT, grand totals, payment terms, addresses, signatures, or document boilerplate as rows.
- Do NOT invent values not supported by the document.
- If unsure, use the fallback defaults instead of guessing.
- If the document is a quote, contract, or invoice, still extract the product rows.
- Be strict and conservative.
"""

USER_TEMPLATE = """\
Canonical comstruct fields:
{fields}

Use these fallback defaults exactly when a value is missing:
{{
  "sku": "",
  "name": "",
  "description": "",
  "category": "",
  "unit": "",
  "packaging_qty": null,
  "unit_price": 0,
  "currency": "unknown",
  "manufacturer": "",
  "manufacturer_sku": "",
  "ean": "",
  "image_url": "",
  "special_info": "",
  "source_delivery_days": null,
  "must_order": false,
  "base_discount_pct": 0,
  "bulk_discount_pct": 0,
  "bulk_discount_threshold": null
}}

Mapping rules:
- Product ID / Artikelnummer / Art.-Nr. -> sku
- Product Name / Bezeichnung / Produktname -> name
- Units like pcs, pair, pairs, box, roll, can, m, kg -> unit
- Price columns with currency symbols usually map to unit_price and currency
- Quantity or ordered quantity is NOT packaging_qty
- Only explicit VPE / pack size / carton content / units per package -> packaging_qty
- Extra useful row-level text goes to special_info
- Do not infer manufacturer, manufacturer_sku, or ean without explicit evidence

Delivery rule:
- If the document says "Delivery within X days" or equivalent and no row-level delivery value exists,
  you may set source_delivery_days = X for all rows only if the statement clearly applies to all products.

Row detection rules:
- Extract only real product rows.
- A row is usually a product if it contains at least:
  - a sku-like identifier, or
  - a product name, or
  - a combination of name + unit/price
- Skip:
  - totals
  - subtotals
  - grand total
  - payment terms
  - signature blocks
  - addresses
  - free prose unrelated to a specific product row

Return a JSON object exactly of this shape:
{{
  "language_detected": "<de|fr|it|en|unknown>",
  "currency_detected": "<CHF|EUR|unknown>",
  "document_type": "<catalogue|quote|contract|invoice|unknown>",
  "rows": [
    {{
      "sku": "",
      "name": "",
      "description": "",
      "category": "",
      "unit": "",
      "packaging_qty": null,
      "unit_price": 0,
      "currency": "unknown",
      "manufacturer": "",
      "manufacturer_sku": "",
      "ean": "",
      "image_url": "",
      "special_info": "",
      "source_delivery_days": null,
      "must_order": false,
      "base_discount_pct": 0,
      "bulk_discount_pct": 0,
      "bulk_discount_threshold": null
    }}
  ],
  "warnings": ["<free-form warnings>"]
}}

Markdown document:
{markdown}

Output JSON only. No prose. No markdown fences.
"""


def build_messages(markdown_text: str) -> list[dict]:
    user = USER_TEMPLATE.format(
        fields="\n".join(f"  - {field}" for field in CANONICAL_FIELDS),
        markdown=markdown_text,
    )
    return [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": user},
    ]