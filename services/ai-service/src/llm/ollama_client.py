"""LLM transport helpers for backend AI calls.

When LLM_PROVIDER=openai, the web/backend routes use OpenAI via LangChain and
smaller budget-friendly models. Ollama is kept only as an optional local
fallback for development and mobile-adjacent experimentation.

Provides:
- call_ollama_json: provider-aware structured JSON generation
- call_ollama_stream: provider-aware streaming text generation
- ollama_embed_batch / ollama_embed_one: optional local embeddings fallback
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import re
from typing import Any, AsyncIterator, Sequence

import httpx

from ..config import settings
from .langchain_client import (
    call_langchain_openai_json,
    call_langchain_openai_stream,
    call_langchain_openai_vision_json,
)

log = logging.getLogger(__name__)

EMBED_DIM = 1536  # padded/hashed dimension for pgvector compatibility


def _strip_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\n?", "", s)
        s = re.sub(r"\n?```$", "", s)
    return s.strip()


def _extract_json(text: str) -> dict:
    """Best-effort JSON extraction from model output."""
    text = text.strip()
    if not text:
        raise ValueError("Empty model output")

    text = _strip_fences(text)

    def _normalise_json_payload(parsed: Any) -> dict[str, Any]:
        if isinstance(parsed, dict):
            return parsed
        if isinstance(parsed, list):
            return {"results": parsed}
        return {"value": parsed}

    # Try direct parse
    try:
        return _normalise_json_payload(json.loads(text))
    except json.JSONDecodeError:
        pass
    # Find first { ... } block
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return _normalise_json_payload(json.loads(text[start:end + 1]))
        except json.JSONDecodeError:
            pass
    # Find first [ ... ] block
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end != -1 and end > start:
        try:
            return _normalise_json_payload(json.loads(text[start:end + 1]))
        except json.JSONDecodeError:
            pass
    raise ValueError(f"Could not parse JSON from model output: {text[:200]}")


async def call_ollama_json(
    system: str,
    messages: list[dict],
    *,
    max_tokens: int = 2048,
    temperature: float = 0.3,
    stub: dict | None = None,
) -> dict[str, Any]:
    """Dispatch structured generation to OpenAI via LangChain or Ollama fallback."""
    if settings.LLM_PROVIDER == "openai" and settings.OPENAI_API_KEY:
        return await call_langchain_openai_json(
            system=system,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stub=stub,
        )

    ollama_messages = [{"role": "system", "content": system + "\n\nRespond with valid JSON only. No markdown, no explanation."}]
    for m in messages:
        ollama_messages.append({"role": m.get("role", "user"), "content": m.get("content", "")})

    try:
        async with httpx.AsyncClient(timeout=settings.OLLAMA_TIMEOUT) as client:
            resp = await client.post(
                f"{settings.OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": settings.OLLAMA_MODEL,
                    "messages": ollama_messages,
                    "stream": False,
                    "format": "json",
                    "options": {
                        "temperature": temperature,
                        "num_predict": max_tokens,
                    },
                },
            )
            resp.raise_for_status()
            data = resp.json()
            content = data.get("message", {}).get("content", "")
            return _extract_json(content)
    except Exception as e:
        log.warning("Ollama call failed (%s), using stub", e)
        if stub is not None:
            return stub
        raise


async def call_ollama_stream(
    system: str,
    user_message: str,
    *,
    temperature: float = 0.3,
    max_tokens: int = 1024,
) -> AsyncIterator[str]:
    """Stream text from OpenAI via LangChain or Ollama fallback."""
    if settings.LLM_PROVIDER == "openai" and settings.OPENAI_API_KEY:
        async for chunk in call_langchain_openai_stream(
            system=system,
            user_message=user_message,
            temperature=temperature,
            max_tokens=max_tokens,
        ):
            yield chunk
        return

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_message},
    ]
    async with httpx.AsyncClient(timeout=settings.OLLAMA_TIMEOUT) as client:
        async with client.stream(
            "POST",
            f"{settings.OLLAMA_BASE_URL}/api/chat",
            json={
                "model": settings.OLLAMA_MODEL,
                "messages": messages,
                "stream": True,
                "options": {
                    "temperature": temperature,
                    "num_predict": max_tokens,
                },
            },
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                    content = chunk.get("message", {}).get("content", "")
                    if content:
                        yield content
                except json.JSONDecodeError:
                    continue


async def call_ollama_vision(
    system: str,
    user_message: str,
    image_b64: str,
    *,
    max_tokens: int = 1024,
    temperature: float = 0.2,
    stub: dict | None = None,
    content_type: str | None = None,
) -> dict[str, Any]:
    """Dispatch vision analysis to OpenAI via LangChain or Ollama fallback."""
    if settings.LLM_PROVIDER == "openai" and settings.OPENAI_API_KEY:
        return await call_langchain_openai_vision_json(
            system=system,
            user_message=user_message,
            image_b64=image_b64,
            max_tokens=max_tokens,
            temperature=temperature,
            stub=stub,
            content_type=content_type,
        )

    messages = [
        {"role": "system", "content": system + "\n\nRespond with valid JSON only."},
        {"role": "user", "content": user_message, "images": [image_b64]},
    ]
    try:
        async with httpx.AsyncClient(timeout=settings.OLLAMA_TIMEOUT) as client:
            resp = await client.post(
                f"{settings.OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": settings.OLLAMA_MODEL,
                    "messages": messages,
                    "stream": False,
                    "format": "json",
                    "options": {
                        "temperature": temperature,
                        "num_predict": max_tokens,
                    },
                },
            )
            resp.raise_for_status()
            data = resp.json()
            content = data.get("message", {}).get("content", "")
            return _extract_json(content)
    except Exception as e:
        log.warning("Ollama vision call failed (%s), using stub", e)
        if stub is not None:
            return stub
        raise


def _deterministic_embedding(text: str) -> list[float]:
    """Stable pseudo-embedding for offline fallback."""
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


async def ollama_embed_batch(texts: Sequence[str]) -> list[list[float]]:
    """Get embeddings from Ollama. Falls back to deterministic hashing."""
    try:
        results = []
        async with httpx.AsyncClient(timeout=settings.OLLAMA_TIMEOUT) as client:
            for text in texts:
                resp = await client.post(
                    f"{settings.OLLAMA_BASE_URL}/api/embed",
                    json={"model": settings.OLLAMA_EMBED_MODEL, "input": text},
                )
                resp.raise_for_status()
                data = resp.json()
                emb = data.get("embeddings", [[]])[0]
                # Pad or truncate to EMBED_DIM for pgvector compatibility
                if len(emb) < EMBED_DIM:
                    emb.extend([0.0] * (EMBED_DIM - len(emb)))
                elif len(emb) > EMBED_DIM:
                    emb = emb[:EMBED_DIM]
                results.append(emb)
        return results
    except Exception as e:
        log.warning("Ollama embed failed (%s), using deterministic fallback", e)
        return [_deterministic_embedding(t) for t in texts]


async def ollama_embed_one(text: str) -> list[float]:
    return (await ollama_embed_batch([text]))[0]


async def check_ollama_health() -> dict:
    """Check if Ollama is running and which models are available."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            models = [m["name"] for m in data.get("models", [])]
            return {
                "status": "ok",
                "models": models,
                "configured_model": settings.OLLAMA_MODEL,
                "model_available": settings.OLLAMA_MODEL in models,
            }
    except Exception as e:
        return {"status": "error", "error": str(e)}
