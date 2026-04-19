"""LLM-assisted A/B/C classification (§5.2) with deterministic fallback."""
from typing import Any

from ..llm.anthropic_client import call_claude_json
from ..prompts import c_material_classifier as cmc


_TAXONOMY_RULES = [
    {
        "code": "tools.hand.hammers.sledge",
        "label": "Hand Tools > Hammers > Sledge Hammer",
        "category": "Tools",
        "patterns": ("sledge hammer", "sledgehammer", "club hammer", "schlaghammer", "faustel", "faeustel", "fäustel"),
    },
    {
        "code": "tools.hand.hammers.claw",
        "label": "Hand Tools > Hammers > Claw Hammer",
        "category": "Tools",
        "patterns": ("claw hammer", "nail hammer", "carpenter hammer", "latthammer", "zimmermannshammer"),
    },
    {
        "code": "tools.lighting.site_lamps",
        "label": "Tools > Lighting > Site Lamps",
        "category": "Tools",
        "patterns": ("site lamp", "site light", "baustellenlampe", "work light", "led site lamp"),
    },
    {
        "code": "tools.abrasives.cutting_discs",
        "label": "Tools > Abrasives > Cutting Discs",
        "category": "Tools",
        "patterns": ("cutting disc", "trennscheibe"),
    },
    {
        "code": "fasteners.anchors.anchor_bolts",
        "label": "Fasteners > Anchors > Anchor Bolts",
        "category": "Anchors",
        "patterns": ("anchor bolt", "anchor bolts", "ankerbolzen"),
    },
    {
        "code": "fasteners.anchors.concrete_screws",
        "label": "Fasteners > Anchors > Concrete Screws",
        "category": "Anchors",
        "patterns": ("concrete screw", "betonschraube", "anchor screw"),
    },
    {
        "code": "drywall.anchors.metal",
        "label": "Drywall > Anchors > Metal Anchors",
        "category": "Drywall",
        "patterns": ("drywall metal anchor", "drywall anchor"),
    },
    {
        "code": "fasteners.screws.drywall",
        "label": "Fasteners > Screws > Drywall Screws",
        "category": "Drywall",
        "patterns": ("drywall screw", "gips screw", "coarse thread screw"),
    },
    {
        "code": "drywall.compounds.joint_filler",
        "label": "Drywall > Compounds > Joint Filler",
        "category": "Drywall",
        "patterns": ("joint filler", "filler drywall", "spachtelmasse"),
    },
    {
        "code": "fasteners.nuts.hex",
        "label": "Fasteners > Nuts > Hex Nuts",
        "category": "Fasteners",
        "patterns": ("hex nut", "hex nuts", "mutter", "nut and bolt"),
    },
    {
        "code": "fasteners.hardware.brackets",
        "label": "Fasteners > Hardware > Brackets",
        "category": "Fasteners",
        "patterns": ("bracket", "winkelverbinder"),
    },
    {
        "code": "fasteners.nails.general",
        "label": "Fasteners > Nails",
        "category": "Fasteners",
        "patterns": ("nail", "nägel", "nagel"),
    },
    {
        "code": "fasteners.screws.general",
        "label": "Fasteners > Screws",
        "category": "Fasteners",
        "patterns": ("screw", "schraube", "schrauben", "wood screw"),
    },
    {
        "code": "ppe.hand_protection.gloves",
        "label": "PPE > Hand Protection > Gloves",
        "category": "PPE",
        "patterns": ("glove", "handschuh", "handschuhe", "bauhandschuhe"),
    },
    {
        "code": "ppe.respiratory.ffp2_masks",
        "label": "PPE > Respiratory Protection > FFP2 Masks",
        "category": "PPE",
        "patterns": ("ffp2", "dust mask", "respirator pack"),
    },
    {
        "code": "ppe.head_protection.hard_hats",
        "label": "PPE > Head Protection > Hard Hats",
        "category": "PPE",
        "patterns": ("hard hat", "helmet"),
    },
    {
        "code": "ppe.visibility.high_vis_vests",
        "label": "PPE > Visibility > High-Vis Vests",
        "category": "PPE",
        "patterns": ("high vis vest", "hi vis vest", "safety vest", "warnweste"),
    },
    {
        "code": "electrical.cable_management.cable_ties",
        "label": "Electrical > Cable Management > Cable Ties",
        "category": "Electrical",
        "patterns": ("cable tie", "kabelbinder"),
    },
    {
        "code": "electrical.insulation.tape",
        "label": "Electrical > Insulation > Tape",
        "category": "Electrical",
        "patterns": ("electrical insulation tape", "electrical tape", "insulation tape"),
    },
    {
        "code": "electrical.power.extension_cords",
        "label": "Electrical > Power Distribution > Extension Cords",
        "category": "Electrical",
        "patterns": ("extension cable", "extension lead", "extension cord"),
    },
    {
        "code": "site.supplies.batteries.aa",
        "label": "Site Supplies > Batteries > AA",
        "category": "Site Supplies",
        "patterns": ("batteries aa", "battery aa", "aa industrial pack"),
    },
    {
        "code": "site.layout.chalk_refill",
        "label": "Site Layout > Chalk Lines > Refill",
        "category": "Site Supplies",
        "patterns": ("chalk line refill", "marking chalk"),
    },
    {
        "code": "site.supplies.cleaning.wipes",
        "label": "Site Supplies > Cleaning > Wipes",
        "category": "Site Supplies",
        "patterns": ("cleaning wipe", "cleaning wipes"),
    },
    {
        "code": "consumables.tapes.duct",
        "label": "Consumables > Tapes > Duct Tape",
        "category": "Consumables",
        "patterns": ("duct tape", "gewebeband"),
    },
    {
        "code": "sealants.foams.expanding",
        "label": "Sealants > Foams > Expanding Foam",
        "category": "Sanitary",
        "patterns": ("expanding foam", "fire rated foam", "montageschaum"),
    },
    {
        "code": "sealants.backer_rods.foam",
        "label": "Sealants > Backer Rods > Foam Rod",
        "category": "Sanitary",
        "patterns": ("backer rod", "foam backer"),
    },
    {
        "code": "concrete.repair.mortar",
        "label": "Concrete > Repair > Mortar",
        "category": "Concrete",
        "patterns": ("repair mortar", "concrete repair mortar", "reparaturmortel", "reparaturmörtel"),
    },
    {
        "code": "piping.conduit.general",
        "label": "Piping & Conduit > General",
        "category": "Piping & Conduit",
        "patterns": ("pipe", "conduit", "rohr", "tube", "clamp"),
    },
]


def _infer_taxonomy(item: dict) -> dict[str, str]:
    explicit_code = str(item.get("taxonomy_code") or "").strip().lower()
    explicit_label = str(item.get("taxonomy_label") or "").strip()
    if explicit_code and explicit_label:
        return {
            "taxonomy_code": explicit_code,
            "taxonomy_label": explicit_label,
            "category": str(item.get("category") or explicit_label.split(" > ", 1)[0]).strip() or "Consumables",
        }

    text = " ".join(
        str(v) for v in [item.get("name"), item.get("category"), item.get("description")]
        if v
    ).lower()
    for rule in _TAXONOMY_RULES:
        if any(pattern in text for pattern in rule["patterns"]):
            return {
                "taxonomy_code": rule["code"],
                "taxonomy_label": rule["label"],
                "category": str(item.get("category") or rule["category"]).strip() or rule["category"],
            }

    fallback_category = str(item.get("category") or "Consumables").strip() or "Consumables"
    fallback_code = fallback_category.lower().replace(" ", ".")
    return {
        "taxonomy_code": f"{fallback_code}.general",
        "taxonomy_label": f"{fallback_category} > General",
        "category": fallback_category,
    }


def _normalise_classification_result(items: list[dict], result: dict) -> dict:
    rows = result.get("results", []) if isinstance(result, dict) else []
    by_idx = {row.get("input_index", i): row for i, row in enumerate(rows) if isinstance(row, dict)}

    normalised = []
    for i, item in enumerate(items):
        taxonomy = _infer_taxonomy(item)
        row = dict(by_idx.get(i, {}))
        row["input_index"] = i
        row["material_class"] = row.get("material_class") if row.get("material_class") in {"A", "B", "C"} else "C"
        row["confidence"] = round(float(row.get("confidence") or 0.58), 2)
        row["category"] = row.get("category") or item.get("category") or taxonomy["category"]
        row["taxonomy_code"] = row.get("taxonomy_code") or taxonomy["taxonomy_code"]
        row["taxonomy_label"] = row.get("taxonomy_label") or taxonomy["taxonomy_label"]
        row["rationale"] = row.get("rationale") or "taxonomy-enriched classification"
        normalised.append(row)

    return {"results": normalised}


def _fallback_classify(items: list[dict]) -> dict:
    """Evidence-based local classifier used when a remote model is unavailable."""
    a_keywords = (
        "rebar", "stahlträger", "beam", "concrete", "beton", "asphalt",
        "cable duct", "kabelschacht", "pipe", "rohr", "anchor rail",
        "structural", "fertigteil", "bewehr",
    )
    b_keywords = (
        "anchor", "fastener", "membrane", "insulation", "adhesive",
        "sealant", "valve", "pump", "drywall", "suspension", "bracket",
    )
    c_keywords = (
        "screw", "bolt", "washer", "tape", "glove", "consumable",
        "clip", "spacer", "foam", "nail",
    )

    results = []
    for i, it in enumerate(items):
        price = float(it.get("unit_price") or 0)
        text = " ".join(
            str(v) for v in [it.get("name"), it.get("category"), it.get("description")]
            if v
        ).lower()
        taxonomy = _infer_taxonomy(it)

        evidence: list[str] = []
        material_class = "C"
        confidence = 0.58

        if any(k in text for k in a_keywords):
            material_class = "A"
            confidence = 0.82
            evidence.append("structural keyword or heavy-duty material signal")
        elif any(k in text for k in b_keywords):
            material_class = "B"
            confidence = 0.72
            evidence.append("trade-critical installation component")
        elif any(k in text for k in c_keywords):
            evidence.append("standard consumable or accessory")

        if price >= 120:
            material_class = "A"
            confidence = max(confidence, 0.8)
            evidence.append(f"high unit price ({price:.2f})")
        elif price >= 50 and material_class == "C":
            material_class = "B"
            confidence = max(confidence, 0.68)
            evidence.append(f"mid-range unit price ({price:.2f})")
        elif price > 0:
            evidence.append(f"lower unit price ({price:.2f})")

        results.append({
            "input_index": i,
            "material_class": material_class,
            "confidence": round(confidence, 2),
            "category": it.get("category") or taxonomy["category"],
            "taxonomy_code": taxonomy["taxonomy_code"],
            "taxonomy_label": taxonomy["taxonomy_label"],
            "rationale": "; ".join(evidence) or "limited evidence, defaulted to consumable class",
        })

    return _normalise_classification_result(items, {"results": results})


def _stub_classify(items: list[dict]) -> dict:
    """Backward-compatible deterministic classifier used by tests and offline flows."""
    return _fallback_classify(items)


async def classify(items: list[dict]) -> dict[str, Any]:
    result = await call_claude_json(
        system=cmc.SYSTEM,
        messages=cmc.build_messages(items),
        max_tokens=2048,
        temperature=0.0,
        stub=_stub_classify(items),
    )
    return _normalise_classification_result(items, result)
