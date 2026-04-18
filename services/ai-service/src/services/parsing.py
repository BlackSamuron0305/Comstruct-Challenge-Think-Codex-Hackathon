"""CSV / XLSX / PDF / Image parsing for the supplier-ingestion pipeline."""
from __future__ import annotations

import io
import logging
from typing import Any

import pandas as pd

MAX_SAMPLE_VALUES = 5
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
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(content))
    rows: list[str] = []
    for page in reader.pages:
        for line in (page.extract_text() or "").splitlines():
            line = line.strip()
            if line:
                rows.append(line)
    return pd.DataFrame({"text": rows})


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
