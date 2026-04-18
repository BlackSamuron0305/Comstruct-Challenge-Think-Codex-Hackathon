"""Anthropic Claude wrapper that always returns parsed JSON.

Uses claude-sonnet-4-5 by default, with retry on 429/transient errors
and a deterministic stub when no API key is configured (handy for tests
and the demo when offline).
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from anthropic import AsyncAnthropic
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from ..config import settings

log = logging.getLogger(__name__)

_client: AsyncAnthropic | None = None


def _get_client() -> AsyncAnthropic | None:
    global _client
    if not settings.ANTHROPIC_API_KEY:
        return None
    if _client is None:
        _client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


def _strip_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\n?", "", s)
        s = re.sub(r"\n?```$", "", s)
    return s.strip()


@retry(
    reraise=True,
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception_type(Exception),
)
async def call_claude_json(
    system: str,
    messages: list[dict],
    *,
    max_tokens: int = 2048,
    temperature: float = 0.0,
    stub: dict | None = None,
) -> dict[str, Any]:
    client = _get_client()
    if client is None:
        if stub is not None:
            log.warning("ANTHROPIC_API_KEY missing — returning deterministic stub")
            return stub
        raise RuntimeError("ANTHROPIC_API_KEY not configured and no stub provided")

    resp = await client.messages.create(
        model=settings.ANTHROPIC_MODEL,
        system=system,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
    )
    raw = "".join(
        getattr(block, "text", "") for block in resp.content if getattr(block, "type", None) == "text"
    )
    cleaned = _strip_fences(raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Salvage attempt: extract first {...} block
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if m:
            return json.loads(m.group(0))
        raise
