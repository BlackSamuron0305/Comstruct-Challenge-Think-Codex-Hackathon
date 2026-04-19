from __future__ import annotations

import json
import logging
import re
from typing import Any, AsyncIterator

from ..config import settings

log = logging.getLogger(__name__)


def _extract_json(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)

    def _normalise_json_payload(parsed: Any) -> dict[str, Any]:
        if isinstance(parsed, dict):
            return parsed
        if isinstance(parsed, list):
            return {"results": parsed}
        return {"value": parsed}

    try:
        return _normalise_json_payload(json.loads(text))
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return _normalise_json_payload(json.loads(text[start:end + 1]))
        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end != -1 and end > start:
            return _normalise_json_payload(json.loads(text[start:end + 1]))
        raise


def _stringify_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text")
                if text:
                    parts.append(str(text))
                else:
                    parts.append(json.dumps(item, ensure_ascii=False))
            else:
                parts.append(str(item))
        return "\n".join(part for part in parts if part).strip()
    return str(content)


def _json_response_kwargs() -> dict[str, Any]:
    return {"response_format": {"type": "json_object"}}


async def call_langchain_openai_json(
    *,
    system: str,
    messages: list[dict],
    max_tokens: int = 2048,
    temperature: float = 0.2,
    stub: dict | None = None,
    model: str | None = None,
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
            model=model or settings.OPENAI_MODEL,
            api_key=settings.OPENAI_API_KEY,
            temperature=temperature,
            max_tokens=max_tokens,
            model_kwargs=_json_response_kwargs(),
        )
        response = await llm.ainvoke(lc_messages)
        return _extract_json(_stringify_content(response.content))
    except Exception as e:
        log.warning("LangChain OpenAI call failed (%s), using stub", e)
        if stub is not None:
            return stub
        raise


async def call_langchain_openai_stream(
    *,
    system: str,
    user_message: str,
    temperature: float = 0.2,
    max_tokens: int = 1024,
    model: str | None = None,
) -> AsyncIterator[str]:
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is required for LangChain OpenAI streaming")

    from langchain_openai import ChatOpenAI
    from langchain_core.messages import HumanMessage, SystemMessage

    llm = ChatOpenAI(
        model=model or settings.OPENAI_MODEL,
        api_key=settings.OPENAI_API_KEY,
        temperature=temperature,
        max_tokens=max_tokens,
        streaming=True,
    )

    async for chunk in llm.astream([
        SystemMessage(content=system),
        HumanMessage(content=user_message),
    ]):
        text = _stringify_content(getattr(chunk, "content", ""))
        if text:
            yield text


async def call_langchain_openai_vision_json(
    *,
    system: str,
    user_message: str,
    image_b64: str,
    max_tokens: int = 1024,
    temperature: float = 0.2,
    stub: dict | None = None,
    content_type: str | None = None,
    model: str | None = None,
) -> dict[str, Any]:
    if not settings.OPENAI_API_KEY:
        if stub is not None:
            return stub
        raise RuntimeError("OPENAI_API_KEY is required for LangChain OpenAI vision calls")

    try:
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import HumanMessage, SystemMessage
    except Exception as e:
        log.warning("LangChain vision import failed (%s), using stub", e)
        if stub is not None:
            return stub
        raise

    image_url = f"data:{content_type or 'image/png'};base64,{image_b64}"
    try:
        llm = ChatOpenAI(
            model=model or settings.OPENAI_VISION_MODEL,
            api_key=settings.OPENAI_API_KEY,
            temperature=temperature,
            max_tokens=max_tokens,
            model_kwargs=_json_response_kwargs(),
        )
        response = await llm.ainvoke([
            SystemMessage(content=system + "\n\nReturn valid JSON only."),
            HumanMessage(content=[
                {"type": "text", "text": user_message},
                {"type": "image_url", "image_url": {"url": image_url}},
            ]),
        ])
        return _extract_json(_stringify_content(response.content))
    except Exception as e:
        log.warning("LangChain OpenAI vision call failed (%s), using stub", e)
        if stub is not None:
            return stub
        raise
