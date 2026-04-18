"""OpenAI embedding wrapper (text-embedding-3-small, 1536 dims)."""
from __future__ import annotations

import hashlib
import logging
import math
from typing import Sequence

from openai import AsyncOpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from ..config import settings

log = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None
EMBED_DIM = 1536


def _get_client() -> AsyncOpenAI | None:
    global _client
    if not settings.OPENAI_API_KEY:
        return None
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


def _deterministic_embedding(text: str) -> list[float]:
    """Stable pseudo-embedding for offline mode / tests."""
    h = hashlib.sha512(text.encode("utf-8")).digest()
    floats: list[float] = []
    while len(floats) < EMBED_DIM:
        for i in range(0, len(h), 2):
            floats.append((int.from_bytes(h[i:i + 2], "big") / 0xFFFF) * 2 - 1)
            if len(floats) >= EMBED_DIM:
                break
        h = hashlib.sha512(h).digest()
    norm = math.sqrt(sum(x * x for x in floats)) or 1.0
    return [x / norm for x in floats]


@retry(reraise=True, stop=stop_after_attempt(3),
       wait=wait_exponential(multiplier=1, min=1, max=10))
async def embed_batch(texts: Sequence[str]) -> list[list[float]]:
    client = _get_client()
    if client is None:
        log.warning("OPENAI_API_KEY missing — returning deterministic stub embeddings")
        return [_deterministic_embedding(t) for t in texts]
    resp = await client.embeddings.create(
        model=settings.OPENAI_EMBED_MODEL,
        input=list(texts),
    )
    return [d.embedding for d in resp.data]


async def embed_one(text: str) -> list[float]:
    return (await embed_batch([text]))[0]
