"""LLM dispatcher — routes to Ollama (local) or OpenAI (production).

Switch via LLM_PROVIDER env var: "ollama" (default) or "openai".
All callers import call_claude_json from here — no changes needed when switching.
"""
from __future__ import annotations

import logging
from typing import Any

from ..config import settings
from .langchain_client import call_langchain_openai_json

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
    if not settings.OPENAI_API_KEY:
        log.warning("OPENAI_API_KEY not set, using stub")
        if stub is not None:
            return stub
        raise RuntimeError("OPENAI_API_KEY is required when LLM_PROVIDER=openai")
    return await call_langchain_openai_json(
        system=system,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        stub=stub,
    )
