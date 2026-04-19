import uuid

import pandas as pd
import pytest

from src.services import ingestion


@pytest.mark.asyncio
async def test_ingest_supplier_file_reuses_prepared_rows_without_reparsing(monkeypatch):
    captured: dict[str, object] = {}
    supplier_id = str(uuid.uuid4())

    monkeypatch.setattr(
        ingestion,
        "parse_tabular",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("parse_tabular should not be called")),
    )
    monkeypatch.setattr(
        ingestion,
        "extract_pdf_items",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("extract_pdf_items should not be called")),
    )
    monkeypatch.setattr(
        ingestion,
        "map_columns",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("map_columns should not be called")),
    )

    async def fake_classify(items):
        return {
            "results": [
                {
                    "input_index": 0,
                    "material_class": "C",
                    "confidence": 0.91,
                    "category": "Tools",
                    "taxonomy_code": "tools.hand.hammers.claw",
                    "taxonomy_label": "Hand Tools > Hammers > Claw Hammer",
                }
            ]
        }

    async def fake_bulk_upsert_products(supplier_id: str, products: list[dict]):
        captured["supplier_id"] = supplier_id
        captured["products"] = products
        return {"upserted": len(products), "errors": []}

    async def fake_embed_batch(batch: list[str]):
        return [[0.1, 0.2, 0.3] for _ in batch]

    monkeypatch.setattr(ingestion, "classify", fake_classify)
    monkeypatch.setattr(ingestion, "bulk_upsert_products", fake_bulk_upsert_products)
    monkeypatch.setattr(ingestion, "embed_batch", fake_embed_batch)

    result = await ingestion.ingest_supplier_file(
        supplier_id=supplier_id,
        filename="catalog.csv",
        content=b"ignored",
        prepared_rows=[
            {
                "sku": "HAM-001",
                "name": "Claw hammer 16oz",
                "description": "for framing",
                "unit": "pcs",
                "unit_price": "19.50",
                "currency": "CHF",
            }
        ],
    )

    assert result["status"] == "ok"
    assert result["c_materials"] == 1
    assert result["embedding_status"] == "scheduled"
    assert captured["supplier_id"] == supplier_id
    assert captured["products"][0]["sku"] == "HAM-001"


@pytest.mark.asyncio
async def test_preview_supplier_file_falls_back_to_pdf_table_when_llm_returns_empty(monkeypatch):
    async def fake_extract_pdf_items(*args, **kwargs):
        return [], {"supplier_name": "ACME"}

    monkeypatch.setattr(ingestion, "extract_pdf_items", fake_extract_pdf_items)
    monkeypatch.setattr(
        ingestion,
        "parse_pdf_to_table",
        lambda content: pd.DataFrame(
            [
                {
                    "Product ID": "C001",
                    "Product Name": "Screws TX20 4x40",
                    "Unit": "pcs",
                    "Qty": "500",
                    "Unit Price (€)": "0.08",
                    "Line Total (€)": "40.00",
                }
            ]
        ),
    )

    result = await ingestion.preview_supplier_file(filename="contract.pdf", content=b"dummy")

    assert result["status"] == "ok"
    assert result["rows_in"] == 1
    assert result["prepared_rows"][0]["sku"] == "C001"
    assert result["prepared_rows"][0]["name"] == "Screws TX20 4x40"
    assert result["prepared_rows"][0]["unit_price"] == "0.08"
