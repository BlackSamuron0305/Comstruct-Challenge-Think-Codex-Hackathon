"""Prompt §5.3 — task_recommender.

Given a foreman's free-text task ("I need to fix a downpipe to the wall"),
recommend a small ordered list of C-materials with quantities and brief
rationales. Used by the mobile app's "Smart Add" flow.
"""

SYSTEM = """You are a Swiss construction site assistant for the comstruct C-Materials Platform. \
You help foremen rapidly assemble small orders of C-materials (consumables, fasteners, sealants, small tools, PPE) for specific on-site tasks. \
You only recommend C-materials. Never recommend structural items (steel, concrete, large pipes). \
Reply in the same language as the user (German default for Swiss sites). \
Only return JSON.\
"""

USER_TEMPLATE = """\
Foreman task description:
\"\"\"{task}\"\"\"

Project context: {project}
Trade: {trade}
Already in cart: {cart}

Available C-materials in catalog (top semantic matches):
{candidates_block}

Pick the smallest sensible bundle (1-6 items) of C-materials needed to complete the task. \
For each item return product_id from the candidates list, suggested quantity (integer or 0.5 step), \
the unit (copy from the candidate), and a one-sentence rationale.

Strict response shape:
{{
  "language": "<de|fr|it|en>",
  "summary":  "<one short sentence telling the foreman what you suggested and why>",
  "items": [
    {{
      "product_id": "<UUID from candidates>",
      "quantity":   <number>,
      "unit":       "<from candidate>",
      "rationale":  "<one short sentence>"
    }}
  ],
  "missing": ["<any task needs that have no good candidate match>"]
}}

Rules:
- Only use product_ids from the candidates list. Never invent SKUs.
- Quantities should reflect a single small task (e.g. 1 tube of sealant, 1 pack of screws).
- Skip items already in cart unless the foreman clearly needs more.
- If nothing in candidates fits, return items=[] and explain in 'missing'.
- Output JSON only."""


def build_messages(
    task: str,
    candidates: list[dict],
    project: str | None = None,
    trade: str | None = None,
    cart: list[dict] | None = None,
) -> list[dict]:
    """candidates = [{"product_id":..,"name":..,"unit":..,"unit_price":..,"category":..}]"""
    if not candidates:
        cand_block = "  (no candidates)"
    else:
        cand_block = "\n".join(
            f"  - {c['product_id']}: {c['name']} "
            f"({c.get('category','?')}, {c.get('unit_price','?')} {c.get('currency','')}, "
            f"unit={c.get('unit','?')})"
            for c in candidates
        )
    cart_str = ", ".join(
        f"{c.get('name')} x{c.get('quantity')}" for c in (cart or [])
    ) or "(empty)"
    user = USER_TEMPLATE.format(
        task=task.strip(),
        project=project or "(unspecified)",
        trade=trade or "(unspecified)",
        cart=cart_str,
        candidates_block=cand_block,
    )
    return [{"role": "user", "content": user}]
