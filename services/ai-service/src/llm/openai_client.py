"""Embedding dispatcher — routes to OpenAI via LangChain for web/backend.

Ollama remains an optional local fallback when explicitly selected.
"""
from __future__ import annotations

import logging
from typing import Sequence

from .ollama_client import EMBED_DIM, _deterministic_embedding, ollama_embed_batch, ollama_embed_one
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
    """Call OpenAI embeddings via LangChain and keep costs low with the small model."""
    try:
        from langchain_openai import OpenAIEmbeddings

        embeddings = OpenAIEmbeddings(
            model=settings.OPENAI_EMBED_MODEL,
            api_key=settings.OPENAI_API_KEY,
        )
        vectors = await embeddings.aembed_documents(list(texts))
        normalised: list[list[float]] = []
        for emb in vectors:
            if len(emb) < EMBED_DIM:
                emb.extend([0.0] * (EMBED_DIM - len(emb)))
            elif len(emb) > EMBED_DIM:
                emb = emb[:EMBED_DIM]
            normalised.append(emb)
        return normalised
    except Exception as e:
        log.warning("OpenAI embed failed (%s), using deterministic fallback", e)
        return [_deterministic_embedding(text) for text in texts]
