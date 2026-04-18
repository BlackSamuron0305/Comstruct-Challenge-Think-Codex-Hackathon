"""Prompt §5.2 — c_material_classifier.

Classify construction materials into ABC classes. comstruct only carries
**C-materials**: low-value, high-frequency, standardised consumables
(fasteners, sealants, hand tools, PPE, small fittings) that should be
ordered without manual review for low totals.

A-materials = high-value structural / project-critical (steel beams, ready-mix concrete, rebar, large precast elements).
B-materials = mid-value, semi-standardised (insulation panels, sanitary fixtures).
C-materials = low-value commodity consumables — what comstruct sells.
"""

SYSTEM = """You are a procurement classifier for the comstruct C-Materials Platform. \
Your job is to label each construction material as A, B, or C using ABC analysis tailored to construction-site procurement. \
Be strict: if a material is structural, project-critical, or a single line costs more than 100 CHF, it is **not** C. \
Only return JSON. \
"""

USER_TEMPLATE = """\
ABC rules for construction-site procurement:

A-materials (NOT in scope for comstruct):
  - Structural elements: precast concrete, steel beams, rebar bundles, large pipes (>Ø50cm), prefab walls.
  - Project-critical bulk: ready-mix concrete deliveries, asphalt, large-format insulation orders.
  - Anything where a single line item exceeds ~100 CHF or a typical project order line exceeds ~500 CHF.
  - Items requiring engineering specification (load class, fire rating sign-off).

B-materials (NOT in scope):
  - Mid-value semi-standardised goods: insulation panels (per pallet), sanitary fixtures, doors, windows, mid-size tools.
  - Items that vary heavily by project but are still off-the-shelf.

C-materials (IN scope for comstruct):
  - Low-value, high-frequency consumables ordered repeatedly across projects.
  - Fasteners (screws, nails, bolts, anchors), sealants, adhesives, tapes.
  - Small hand tools, drill bits, blades, gloves, PPE.
  - Small fittings, electrical connectors, cable ties, hose clamps.
  - Cleaning supplies, marking sprays, chalk lines, small site consumables.
  - Typical line cost <50 CHF, almost always <100 CHF.

Items to classify:
{items_block}

Return strictly:
{{
  "results": [
    {{
      "input_index":   <int>,
      "material_class": "A" | "B" | "C",
      "confidence":     <float 0..1>,
      "category":       "<short canonical category, English>",
      "rationale":      "<one short sentence>"
    }}
  ]
}}

Strict rules:
- Default to A or B when uncertain — comstruct must NEVER carry an A-material.
- Items with line price >100 CHF are almost always A or B.
- Output JSON only, no markdown, no prose."""


def build_messages(items: list[dict]) -> list[dict]:
    """items = [{"name": str, "description": str|None, "unit_price": float|None, "currency": str|None, "category": str|None}]"""
    lines = []
    for i, it in enumerate(items):
        parts = [f"name={it.get('name')!r}"]
        if it.get("description"):
            parts.append(f"description={it['description']!r}")
        if it.get("category"):
            parts.append(f"category={it['category']!r}")
        if it.get("unit_price") is not None:
            parts.append(f"unit_price={it['unit_price']} {it.get('currency') or ''}".strip())
        if it.get("unit"):
            parts.append(f"unit={it['unit']!r}")
        lines.append(f"  [{i}] " + ", ".join(parts))
    user = USER_TEMPLATE.format(items_block="\n".join(lines))
    return [{"role": "user", "content": user}]
