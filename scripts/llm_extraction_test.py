"""Test script: feed the Swiss quote to OpenAI and compare LLM output vs manual extraction."""
import json
import os
from pathlib import Path
import urllib.request


def _load_openai_api_key() -> str:
    key = os.getenv("OPENAI_API_KEY", "").strip()
    if key:
        return key

    env_path = Path(__file__).resolve().parents[1] / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            name, value = stripped.split("=", 1)
            if name.strip() == "OPENAI_API_KEY":
                return value.strip().strip('"').strip("'")

    raise RuntimeError("OPENAI_API_KEY is missing. Add it to the environment or the workspace .env file.")


KEY = _load_openai_api_key()

QUOTE_CONTENT = """Angebot 20859729 dated 26.06.2025. Valid until 30.09.2025. Delivery: 07.07.2025.
Payment: 30 days 2% Skonto, 45 days net.

Pos 10: SKU 100053899 (RG 45001, NPK 151.412.211) K55 PEHD-Riefenrohr schwarz/grau O63mm L5m, 120 M @ 2.39 CHF/M = 286.80
Pos 11 (Alternative to Pos 10): SKU 100053921 (RG 45001) K55 PEHD-Riefenrohr O63mm L10m, 120 M @ 2.10 = 252.00
Pos 150: SKU 100075410 (RG 09183, NPK 151.421.542) Ueberschiebmuffe KRUM MG O80mm, 110 ST @ 3.25 (TZ surcharge +3.00%) = 358.03
Pos 160: SKU 100075412 (RG 09183, NPK 151.421.544) Ueberschiebmuffe KRUM MG O120mm, 15 ST @ 5.73 (TZ +3.00%) = 85.90
Pos 170: SKU 100054046 (RG 45001, NPK 151.421.546) K55 PEHD-Doppelsteckmuffe inkl.Dicht. O63mm Swisscom 1335181, 10 ST @ 4.83 = 48.30
Pos 180: SKU 100040752 (RG 19080, NPK 151.484.111) Warnband ACHTUNG KABEL 100mm L250m rot, 4 ROL @ 21.00 = 84.00
Pos 190: SKU 100113655 (RG 09100, NPK 151.486.001) MAXIMUM Kabeleinzugschnur PP gelb 4mm L500m Reisskraft 300kg, 6 ROL @ 41.00 = 246.00
Pos 201: SKU 100016129 (RG 09270, NPK 151.611.122) Betonrohr mit Boden unbewehrt O80cm H55cm, 2 ST @ 151.68 (Rabatt 52.00% off 316.00) = 303.36
Pos 210: SKU 100018020 (RG 09270, NPK 151.611.122) Konus exzentrisch O80/60cm H50cm, 2 ST @ 116.16 (Rabatt 52.00% off 242.00) = 232.32
Pos 220: SKU 900000385 (RG 99999, NPK 151.611.171) RIKO Schachtring mit Konus FK 60 exzentrisch D100 d160 H100 W12 cm, 1 ST @ 350.40 (Rabatt 52.00% off 730.00) = 350.40
Pos 230: SKU 900000503 (RG 99999, NPK 151.621.001) Kabelschacht quadratisch bewehrt inkl. Bodenablauf L100 B100 H100 W20 cm, 1 ST @ 1376.00 (Rabatt 20.00% off 1720.00) = 1376.00
Pos 240 (Alternative to Pos 230): SKU 100096682 HGC Kabelschacht ohne Boden WS15 L100 B100 H100 Vertiefungen 4cm, 1 ST @ 1000.00 = 1000.00
Pos 260: SKU 100007638 (RG 10074, NPK 151.632.121) BGS Gussschachtdeckel Fig.115-60 B125 O60cm, 2 ST @ 129.92 (TZ +16.00%) = 259.84
Pos 271: SKU 100109495 (RG 10088, NPK 151.632.122) BGS Abdeckung 1020x1000mm D400 mit Betonfuellung DCB102100BVS, 1 ST @ 2815.32 (TZ +16.00%) = 2815.32
Pos 280: SKU 100110568 (RG 13090, NPK 222.212.112) Granitpflasterstein 11/13 feinkorn gespalten Tuerkei, 0.323 TO @ 288.27 (Rabatt 42.00% off 497.00) = 93.11
Pos 290 (Alternative): SKU 100027296 (RG 13056, NPK 222.212.312) Gneisstellplatte Serizzo gesaegt geflammt 8x25cm, 10 M @ 23.13 (Rabatt 38.00%) = 231.26

Summe: 18374.17 CHF, MWST 8.1%: 1488.31, Total inkl. MWST: 19862.50 CHF
Gewicht: 8001.9 KG"""

SYSTEM = (
    "You are a precision document extraction AI for Swiss construction materials procurement. "
    "Extract EVERY line item (Pos) from this Swiss quote (Angebot), including items marked as 'Alternative Position'.\n\n"
    "RULES:\n"
    "2. unit_price = the NET price per unit shown directly in the document (labelled 'Einheitspreis netto' or net unit price column); do NOT compute it by dividing line totals.\n"
    "2. Rabatt items: set base_discount_pct to the % (e.g. 52.0 for 52% Rabatt).\n"
    "3. TZ Zuschlag (surcharge) items: set surcharge_pct to the % (e.g. 3.0 for TZ +3%).\n"
    "4. list_price = gross price before Rabatt/TZ if shown.\n"
    "5. special_info must capture: npk_code (e.g. '151.412.211'), rabattgruppe (e.g. '45001'), "
    "manufacturer_ref (e.g. 'Swisscom 1337435'), dimensions (any size info), article_ref (Artikel XXXXX CREA), notes.\n"
    "6. is_alternative=true for Alternative Positions; set alternative_to_pos to the Pos number it replaces.\n"
    "7. category in English: 'cable conduit', 'cable protection fitting', 'manhole ring', 'manhole cover', "
    "'warning tape', 'cable pulling rope', 'concrete pipe', 'cable shaft', 'paving stone', 'stone slab', etc.\n"
    "8. Use null for anything not explicitly present. Do not invent values.\n\n"
    "Return ONLY valid JSON:\n"
    '{"items":[{"name":"...","sku":"...","quantity":0,"unit":"...","unit_price":0.0,'
    '"list_price":null,"base_discount_pct":null,"surcharge_pct":null,"currency":"CHF",'
    '"category":"...","is_alternative":false,"alternative_to_pos":null,'
    '"procurement_constraint":"none","required_supplier_name":null,'
    '"special_info":{"npk_code":null,"rabattgruppe":null,"manufacturer_ref":null,'
    '"dimensions":null,"article_ref":null,"notes":null}}],'
    '"metadata":{"supplier_name":null,"document_number":"...","document_date":"YYYY-MM-DD",'
    '"valid_until":"YYYY-MM-DD","delivery_date":"YYYY-MM-DD","total_amount":0.0,'
    '"vat_rate":null,"vat_amount":null,"total_with_vat":null,"weight_kg":null,'
    '"payment_terms":"...","currency":"CHF","source_locked":false,'
    '"contract_binding":"none","mandatory_supplier_name":null}}'
)

payload = {
    "model": "gpt-4.1-mini",
    "temperature": 0,
    "max_tokens": 4096,
    "messages": [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": QUOTE_CONTENT},
    ],
}

data = json.dumps(payload).encode("utf-8")
req = urllib.request.Request(
    "https://api.openai.com/v1/chat/completions",
    data=data,
    headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
)

print("Calling OpenAI gpt-4.1-mini...")
with urllib.request.urlopen(req, timeout=60) as r:
    result = json.loads(r.read())

text = result["choices"][0]["message"]["content"]
finish = result["choices"][0]["finish_reason"]
tokens = result["usage"]["total_tokens"]

print(f"Finish: {finish} | Tokens: {tokens}")
print()

# Save raw result
with open("llm_extraction_result.json", "w", encoding="utf-8") as f:
    f.write(text)

# Parse and compare
try:
    extracted = json.loads(text)
    items = extracted.get("items", [])
    meta = extracted.get("metadata", {})

    print(f"=== METADATA ===")
    for k, v in meta.items():
        if v not in (None, "", False, "none"):
            print(f"  {k}: {v}")

    print(f"\n=== {len(items)} ITEMS EXTRACTED ===")
    header = f"{'ALT':<4} {'POS→':<6} {'SKU':<15} {'Name':<48} {'Qty':>6} {'Unit':<5} {'NetPrice':>10} {'ListPrice':>10} {'Disc%':>6} {'TZ%':>5}  {'Category':<22}  {'NPK':<15} {'RG':<8} {'MfgRef'}"
    print(header)
    print("-" * 175)
    for item in items:
        si = item.get("special_info") or {}
        alt = "ALT" if item.get("is_alternative") else ""
        alt_to = str(item.get("alternative_to_pos") or "")
        disc = item.get("base_discount_pct")
        disc_str = f"{disc}%" if disc else "-"
        tz = item.get("surcharge_pct")
        tz_str = f"{tz}%" if tz else "-"
        lp = item.get("list_price")
        lp_str = str(lp) if lp else "-"
        name = str(item.get("name", ""))[:48]
        print(
            f"{alt:<4} {alt_to:<6} {str(item.get('sku','')):<15} {name:<48} "
            f"{str(item.get('quantity',''))!s:>6} {str(item.get('unit','')):<5} "
            f"{str(item.get('unit_price',''))!s:>10} {lp_str:>10} {disc_str:>6} {tz_str:>5}  "
            f"{str(item.get('category','')):<22}  {str(si.get('npk_code') or ''):<15} "
            f"{str(si.get('rabattgruppe') or ''):<8} {si.get('manufacturer_ref') or ''}"
        )
        if si.get("dimensions"):
            print(f"       dimensions: {si['dimensions']}")
        if si.get("article_ref"):
            print(f"       article_ref: {si['article_ref']}")
        if si.get("notes"):
            print(f"       notes: {si['notes']}")
except json.JSONDecodeError as e:
    print(f"Could not parse JSON: {e}")
    print("Raw output saved to llm_extraction_result.json")
