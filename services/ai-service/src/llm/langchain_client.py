from __future__ import annotations

import json
import logging
import re
from typing import Any

from ..config import settings

log = logging.getLogger(__name__)


def _extract_json(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start:end + 1])
        raise


async def call_langchain_openai_json(
    *,
    system: str,
    messages: list[dict],
    max_tokens: int = 2048,
    temperature: float = 0.2,
    stub: dict | None = None,
) -> dict[str, Any]:
    if not settings.OPENAI_API_KEY:
        if stub is not None:
            return stub
        raise RuntimeError("OPENAI_API_KEY is required for LangChain OpenAI calls")

    try:
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
    except Exception as e:
        log.warning("LangChain import failed (%s), using stub", e)
        if stub is not None:
            return stub
        raise

    lc_messages = [SystemMessage(content=system + "\n\nReturn valid JSON only.")]
    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        if role == "assistant":
            lc_messages.append(AIMessage(content=content))
        elif role == "system":
            lc_messages.append(SystemMessage(content=content))
        else:
            lc_messages.append(HumanMessage(content=content))

    try:
        llm = ChatOpenAI(
            model=settings.OPENAI_MODEL,
            api_key=settings.OPENAI_API_KEY,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        response = await llm.ainvoke(lc_messages)
        content = response.content if isinstance(response.content, str) else str(response.content)
        return _extract_json(content)
    except Exception as e:
        log.warning("LangChain OpenAI call failed (%s), using stub", e)
        if stub is not None:
            return stub
        raise
