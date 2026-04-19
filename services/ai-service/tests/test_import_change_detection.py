import pytest

from src.services import ingestion


@pytest.mark.asyncio
async def test_preview_supplier_file_marks_existing_and_changed_rows(monkeypatch):
    async def fake_detect_deltas(items, supplier_id=None):
        return [
            {**items[0], "delta_type": "unchanged"},
            {**items[1], "delta_type": "price_change", "old_price": 9.5, "new_price": 11.0},
            {**items[2], "delta_type": "new_entry"},
        ]

    async def fake_extract_pdf_items(*args, **kwargs):
        return ([
            {"name": "Existing screw", "sku": "A1", "unit": "pc", "unit_price": 9.5, "currency": "CHF"},
            {"name": "Changed hammer", "sku": "B2", "unit": "pc", "unit_price": 11.0, "currency": "CHF"},
            {"name": "New glove", "sku": "C3", "unit": "pair", "unit_price": 4.5, "currency": "CHF"},
        ], {"currency": "CHF"})

    monkeypatch.setattr(ingestion, "extract_pdf_items", fake_extract_pdf_items)
    monkeypatch.setattr(ingestion, "detect_deltas", fake_detect_deltas)

    result = await ingestion.preview_supplier_file(
        filename="supplier-update.pdf",
        content=b"dummy-pdf",
        supplier_id="00000000-0000-0000-0000-000000000001",
    )

    assert result["delta_summary"] == {
        "new_entries": 1,
        "price_changes": 1,
        "unchanged": 1,
    }
    assert [row["delta_type"] for row in result["preview_rows"]] == ["unchanged", "price_change", "new_entry"]


def test_build_upsert_payload_preserves_existing_product_match():
    payload = ingestion._build_upsert_payload(
        "supplier-1",
        [{
            "sku": None,
            "name": "Existing screw",
            "unit": "pc",
            "unit_price": 10,
            "currency": "CHF",
            "matched_product_id": "11111111-1111-1111-1111-111111111111",
        }],
    )

    assert payload[0]["existing_product_id"] == "11111111-1111-1111-1111-111111111111"
