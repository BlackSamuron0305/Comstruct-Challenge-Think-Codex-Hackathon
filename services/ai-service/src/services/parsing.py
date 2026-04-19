"""CSV / XLSX / PDF / Image parsing for the supplier-ingestion pipeline."""
from __future__ import annotations

import io
import logging
import re
from typing import Any

import pandas as pd
from pypdf import PdfReader

MAX_SAMPLE_VALUES = 5
MARKDOWN_DIRECT_CONFIDENCE = 0.66
_ALNUM_RE = re.compile(r"[A-Za-z0-9]")
logger = logging.getLogger(__name__)


def parse_tabular(filename: str, content: bytes) -> pd.DataFrame:
    name = filename.lower()
    if name.endswith(".csv"):
        return pd.read_csv(io.BytesIO(content), sep=None, engine="python", dtype=str).fillna("")
    if name.endswith((".xlsx", ".xls")):
        return pd.read_excel(io.BytesIO(content), dtype=str).fillna("")
    raise ValueError(f"Unsupported file type for tabular ingest: {filename}")


def parse_pdf_to_table(content: bytes) -> pd.DataFrame:
    """Extract tables from PDF using pdfplumber; fall back to pypdf text lines."""
    try:
        import pdfplumber

        all_rows: list[list[str]] = []
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                for table in tables:
                    for row in table:
                        cleaned = [str(cell).strip() if cell else "" for cell in row]
                        if any(cleaned):
                            all_rows.append(cleaned)

        if all_rows:
            header = all_rows[0]
            data = all_rows[1:] if len(all_rows) > 1 else []
            return pd.DataFrame(data, columns=header).fillna("")
    except Exception as e:
        logger.warning("pdfplumber extraction failed (%s), falling back to pypdf", e)

    # Fallback: plain text extraction via pypdf
    reader = PdfReader(io.BytesIO(content))
    rows: list[str] = []
    for page in reader.pages:
        for line in (page.extract_text() or "").splitlines():
            line = line.strip()
            if line:
                rows.append(line)
    return pd.DataFrame({"text": rows})


def parse_pdf_to_markdown(content: bytes) -> str:
    """Convert PDF to markdown first, with graceful fallback."""
    try:
        import tempfile
        import os
        import pymupdf4llm

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        try:
            md = pymupdf4llm.to_markdown(tmp_path)
            if md and md.strip():
                return md.strip()
        finally:
            os.unlink(tmp_path)
    except Exception as e:
        logger.warning("pymupdf4llm markdown extraction failed (%s), falling back to text", e)

    reader = PdfReader(io.BytesIO(content))
    chunks: list[str] = []
    for idx, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()
        if text:
            chunks.append(f"## Page {idx}\n\n{text}")
    return "\n\n".join(chunks).strip()


def extract_catalog_from_markdown(markdown: str) -> list[dict]:
    """Try deterministic extraction from markdown tables before LLM fallback."""
    items: list[dict] = []
    lines = [ln.strip() for ln in markdown.splitlines() if ln.strip()]
    for line in lines:
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) < 2:
            continue
        joined = " ".join(cells).lower()
        if "sku" in joined and "price" in joined:
            continue
        if set("".join(cells)) <= {"-", ":"}:
            continue
        sku = cells[0] if _ALNUM_RE.search(cells[0]) else ""
        name = cells[1] if len(cells) > 1 else ""
        if not name:
            continue
        price_match = re.search(r"(\d+[.,]?\d*)", " ".join(cells[2:])) if len(cells) > 2 else None
        unit_price = float(price_match.group(1).replace(",", ".")) if price_match else None
        items.append({
            "sku": sku or None,
            "name": name,
            "unit_price": unit_price,
            "currency": "CHF",
            "confidence": MARKDOWN_DIRECT_CONFIDENCE,
            "extraction_mode": "markdown_direct",
        })
    return items


def parse_image_to_text(content: bytes) -> str:
    """Extract text from an image using Tesseract OCR."""
    from PIL import Image
    import pytesseract

    image = Image.open(io.BytesIO(content))
    # Use German + English + French for Swiss construction docs
    text = pytesseract.image_to_string(image, lang="deu+eng+fra")
    return text.strip()


def parse_image_to_table(content: bytes) -> pd.DataFrame:
    """Extract text from image via OCR, return as single-column DataFrame for LLM processing."""
    text = parse_image_to_text(content)
    if not text:
        return pd.DataFrame()
    rows = [line.strip() for line in text.splitlines() if line.strip()]
    return pd.DataFrame({"text": rows})


def column_samples(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Returns [{"name": col, "samples": [..]}] suitable for the column_mapper prompt."""
    out: list[dict[str, Any]] = []
    for col in df.columns:
        samples = (
            df[col].astype(str).str.strip().replace("", pd.NA).dropna().unique().tolist()
        )
        out.append({"name": str(col), "samples": samples[:MAX_SAMPLE_VALUES]})
    return out


def apply_mapping(df: pd.DataFrame, mappings: list[dict]) -> list[dict]:
    """Apply a column_mapper response to produce canonical product rows."""
    rename: dict[str, str] = {}
    for m in mappings:
        if m.get("target_field"):
            rename[m["source_column"]] = m["target_field"]
    sliced = df.rename(columns=rename)
    keep = [c for c in sliced.columns if c in rename.values()]
    sliced = sliced[keep].copy()
    return sliced.to_dict(orient="records")
