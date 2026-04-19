import os
import sys
from pathlib import Path

import httpx
import pytest
import pytest_asyncio

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "ai-service"))

from src.services.parsing import build_markdown_chunks

GATEWAY_URL = os.environ.get("API_GATEWAY_URL", "http://localhost:8001")
TEST_EMAIL = "foreman@brueckesg.ch"
TEST_PASSWORD = "comstruct-demo"


@pytest_asyncio.fixture
async def auth_token():
    async with httpx.AsyncClient(base_url=GATEWAY_URL, timeout=30) as client:
        r = await client.post("/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD})
        assert r.status_code == 200, f"Login failed: {r.text}"
        return r.json()["access_token"]


def _pdf_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _make_test_pdf(page_texts: list[str]) -> bytes:
    objects: list[str] = []

    def add_object(body: str = "") -> int:
        objects.append(body)
        return len(objects)

    catalog_id = add_object()
    pages_id = add_object()
    font_id = add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    page_ids: list[int] = []
    for page_text in page_texts:
        lines = [line for line in page_text.splitlines() if line.strip()]
        text_ops = ["BT", "/F1 11 Tf", "72 760 Td", "14 TL"]
        for idx, line in enumerate(lines):
            safe = _pdf_escape(line)
            text_ops.append(f"({safe}) Tj")
            if idx < len(lines) - 1:
                text_ops.append("T*")
        text_ops.append("ET")
        stream = "\n".join(text_ops)
        content_id = add_object(f"<< /Length {len(stream.encode('utf-8'))} >>\nstream\n{stream}\nendstream")
        page_id = add_object(
            f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_id} 0 R >>"
        )
        page_ids.append(page_id)

    objects[catalog_id - 1] = f"<< /Type /Catalog /Pages {pages_id} 0 R >>"
    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects[pages_id - 1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>"

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for idx, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{idx} 0 obj\n{obj}\nendobj\n".encode("utf-8"))
    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("utf-8"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("utf-8"))
    pdf.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\nstartxref\n{xref_offset}\n%%EOF".encode(
            "utf-8"
        )
    )
    return bytes(pdf)


def test_build_markdown_chunks_uses_page_overlap():
    pages = [{"page": i, "markdown": f"## Page {i}\n\nItem {i}"} for i in range(1, 26)]
    chunks = build_markdown_chunks(pages, pages_per_chunk=20, overlap_pages=1, max_chars=100000)

    assert len(chunks) == 2
    assert chunks[0]["start_page"] == 1
    assert chunks[0]["end_page"] == 20
    assert chunks[1]["start_page"] == 20
    assert chunks[1]["end_page"] == 25


@pytest.mark.asyncio
async def test_pdf_extraction_via_gateway_uses_chunk_metadata(auth_token):
    page_texts = []
    for page in range(1, 23):
        page_texts.append(
            "Supplier: Demo Build AG\n"
            f"## Page {page}\n"
            "| SKU | Name | Qty | Unit Price |\n"
            f"| DRY-{page:03d} | Drywall screws box {page} | {page * 10} | {page}.50 |"
        )
    pdf_bytes = _make_test_pdf(page_texts)

    async with httpx.AsyncClient(base_url=GATEWAY_URL, timeout=120) as client:
        r = await client.post(
            "/api/ai/extract-pdf",
            headers={"Authorization": f"Bearer {auth_token}"},
            files={"file": ("chunked-demo.pdf", pdf_bytes, "application/pdf")},
            data={"document_type": "invoice"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "ok"
        assert data["metadata"].get("page_overlap") == 1
        assert data["metadata"].get("pages_per_chunk") == 20
        assert data["metadata"].get("chunk_count", 0) >= 2
