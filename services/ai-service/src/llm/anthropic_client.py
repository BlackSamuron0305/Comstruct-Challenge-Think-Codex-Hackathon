"""LLM dispatcher — routes to Ollama (local) or OpenAI (production).

Switch via LLM_PROVIDER env var: "ollama" (default) or "openai".
All callers import call_claude_json from here — no changes needed when switching.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from ..config import settings

log = logging.getLogger(__name__)


async def call_claude_json(
    system: str,
    messages: list[dict],
    *,
    max_tokens: int = 2048,
    temperature: float = 0.3,
    stub: dict | None = None,
) -> dict[str, Any]:
    """Dispatch to the configured LLM provider."""
    if settings.LLM_PROVIDER == "openai":
        return await _call_openai(system, messages, max_tokens=max_tokens, temperature=temperature, stub=stub)
    # Default: Ollama (local)
    from .ollama_client import call_ollama_json
    return await call_ollama_json(system=system, messages=messages, max_tokens=max_tokens, temperature=temperature, stub=stub)


async def _call_openai(
    system: str,
    messages: list[dict],
    *,
    max_tokens: int = 2048,
    temperature: float = 0.3,
    stub: dict | None = None,
) -> dict[str, Any]:
    """Call OpenAI ChatGPT API. Requires OPENAI_API_KEY to be set."""
    import httpx

    if not settings.OPENAI_API_KEY:
        log.warning("OPENAI_API_KEY not set, using stub")
        if stub is not None:
            return stub
        raise RuntimeError("OPENAI_API_KEY is required when LLM_PROVIDER=openai")

    oai_messages = [{"role": "system", "content": system + "\n\nRespond with valid JSON only."}]
    for m in messages:
        oai_messages.append({"role": m.get("role", "user"), "content": m.get("content", "")})

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.OPENAI_MODEL,
                    "messages": oai_messages,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "response_format": {"type": "json_object"},
                },
            )
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            return json.loads(content)
    except Exception as e:
        log.warning("OpenAI call failed (%s), using stub", e)
        if stub is not None:
            return stub
        raise
