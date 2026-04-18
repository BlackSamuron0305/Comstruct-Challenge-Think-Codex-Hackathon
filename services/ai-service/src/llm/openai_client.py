"""Embedding dispatcher — routes to Ollama (local) or OpenAI (production).

Switch via LLM_PROVIDER env var: "ollama" (default) or "openai".
"""
from __future__ import annotations

import logging
from typing import Sequence

from .ollama_client import ollama_embed_batch, ollama_embed_one, EMBED_DIM
from ..config import settings

log = logging.getLogger(__name__)


async def embed_batch(texts: Sequence[str]) -> list[list[float]]:
    if settings.LLM_PROVIDER == "openai" and settings.OPENAI_API_KEY:
        return await _openai_embed_batch(texts)
    return await ollama_embed_batch(texts)


async def embed_one(text: str) -> list[float]:
    if settings.LLM_PROVIDER == "openai" and settings.OPENAI_API_KEY:
        result = await _openai_embed_batch([text])
        return result[0]
    return await ollama_embed_one(text)


async def _openai_embed_batch(texts: Sequence[str]) -> list[list[float]]:
    """Call OpenAI embeddings API."""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.openai.com/v1/embeddings",
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.OPENAI_EMBED_MODEL,
                    "input": list(texts),
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return [item["embedding"] for item in data["data"]]
    except Exception as e:
        log.warning("OpenAI embed failed (%s), falling back to Ollama", e)
        return await ollama_embed_batch(texts)
