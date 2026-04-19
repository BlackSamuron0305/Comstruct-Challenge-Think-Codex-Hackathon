import re
import unicodedata
from collections.abc import Mapping


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
        "code": "tools.abrasives.cutting_discs",
        "label": "Tools > Abrasives > Cutting Discs",
        "category": "Tools",
        "patterns": ("cutting disc", "trennscheibe"),
    },
    {
        "code": "tools.lighting.site_lamps",
        "label": "Tools > Lighting > Site Lamps",
        "category": "Tools",
        "patterns": ("site lamp", "site light", "baustellenlampe", "work light"),
    },
    {
        "code": "consumables.tapes.duct",
        "label": "Consumables > Tapes > Duct Tape",
        "category": "Consumables",
        "patterns": ("duct tape", "gewebeband"),
    },
    {
        "code": "concrete.repair.mortar",
        "label": "Concrete > Repair > Mortar",
        "category": "Concrete",
        "patterns": ("repair mortar", "concrete repair mortar", "reparaturmortel", "reparaturmörtel"),
    },
    {
        "code": "fasteners.hardware.brackets",
        "label": "Fasteners > Hardware > Brackets",
        "category": "Fasteners",
        "patterns": ("bracket", "winkelverbinder"),
    },
    {
        "code": "fasteners.nuts.hex",
        "label": "Fasteners > Nuts > Hex Nuts",
        "category": "Fasteners",
        "patterns": ("hex nut", "hex nuts", "m10 nut", "mutter"),
    },
    {
        "code": "ppe.hand_protection.gloves",
        "label": "PPE > Hand Protection > Gloves",
        "category": "PPE",
        "patterns": ("glove", "handschuh", "bauhandschuhe"),
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
        "code": "fasteners.screws.general",
        "label": "Fasteners > Screws",
        "category": "Fasteners",
        "patterns": ("screw", "schraube", "schrauben"),
    },
    {
        "code": "fasteners.anchors.general",
        "label": "Fasteners > Anchors",
        "category": "Anchors",
        "patterns": ("anchor", "dubel", "dübel", "anker"),
    },
]


def _normalize_text(*values: object) -> str:
    text = " ".join(str(v or "") for v in values)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def infer_taxonomy_fields(item: Mapping[str, object] | None) -> dict[str, str]:
    payload = item or {}
    explicit_code = str(payload.get("taxonomy_code") or "").strip().lower()
    explicit_label = str(payload.get("taxonomy_label") or "").strip()
    category = str(payload.get("category") or "").strip()

    if explicit_code and explicit_label:
        return {
            "taxonomy_code": explicit_code,
            "taxonomy_label": explicit_label,
            "category": category or explicit_label.split(" > ", 1)[0],
        }

    text = _normalize_text(payload.get("name"), payload.get("category"), payload.get("description"))
    for rule in _TAXONOMY_RULES:
        if any(_normalize_text(pattern) in text for pattern in rule["patterns"]):
            return {
                "taxonomy_code": rule["code"],
                "taxonomy_label": rule["label"],
                "category": category or rule["category"],
            }

    fallback_category = category or "Consumables"
    fallback_key = _normalize_text(fallback_category).replace(" ", ".") or "consumables"
    return {
        "taxonomy_code": f"{fallback_key}.general",
        "taxonomy_label": f"{fallback_category} > General",
        "category": fallback_category,
    }
