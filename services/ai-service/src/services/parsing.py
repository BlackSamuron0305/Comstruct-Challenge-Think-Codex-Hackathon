"""CSV / XLSX / PDF parsing for the supplier-ingestion pipeline (§9)."""
from __future__ import annotations

import io
from typing import Any

import pandas as pd

MAX_SAMPLE_VALUES = 5


def parse_tabular(filename: str, content: bytes) -> pd.DataFrame:
    name = filename.lower()
    if name.endswith(".csv"):
        # auto-detect delimiter
        return pd.read_csv(io.BytesIO(content), sep=None, engine="python", dtype=str).fillna("")
    if name.endswith((".xlsx", ".xls")):
        return pd.read_excel(io.BytesIO(content), dtype=str).fillna("")
    raise ValueError(f"Unsupported file type for tabular ingest: {filename}")


def parse_pdf_to_table(content: bytes) -> pd.DataFrame:
    """Best-effort PDF table extraction.

    Real production would use Camelot/pdfplumber; for the hackathon we extract
    plain text with pypdf and return a single-column 'text' frame so the LLM
    can still attempt mapping."""
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(content))
    rows: list[str] = []
    for page in reader.pages:
        for line in (page.extract_text() or "").splitlines():
            line = line.strip()
            if line:
                rows.append(line)
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
