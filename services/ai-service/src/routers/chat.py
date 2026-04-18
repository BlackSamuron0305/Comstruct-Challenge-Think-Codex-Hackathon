"""AI Chat router — construction assistant powered by local Ollama.

Provides:
- POST /ai/chat — single-turn construction materials Q&A
- POST /ai/chat/stream — SSE streaming response for real-time UI
"""
import json
import logging

from fastapi import APIRouter, Depends, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..dependencies import require_internal_secret
from ..llm.ollama_client import call_ollama_json, call_ollama_stream

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["chat"])

CONSTRUCTION_SYSTEM = """You are a construction materials procurement assistant for Swiss construction companies.
You help with:
- Finding the right materials for construction tasks
- Comparing suppliers and prices
- Explaining material specifications and standards (SIA norms, EN standards)
- Suggesting alternatives and cost-saving options
- Answering questions about delivery logistics and availability
- Helping with quantity calculations

Always respond in the user's language. Default to German (Swiss German context).
Keep answers practical and actionable for construction site workers.
Use CHF as default currency. Reference Swiss construction norms when relevant."""


class ChatRequest(BaseModel):
    message: str
    context: dict | None = None  # optional: project info, current cart, etc.
    language: str = "de"


class ChatResponse(BaseModel):
    reply: str
    suggestions: list[str] | None = None
    materials_mentioned: list[dict] | None = None


@router.post("/chat", response_model=ChatResponse, dependencies=[Depends(require_internal_secret)])
async def chat_endpoint(body: ChatRequest):
    """Single-turn construction assistant chat."""
    context_str = ""
    if body.context:
        context_str = f"\n\nCurrent context: {json.dumps(body.context, ensure_ascii=False)}"

    system = CONSTRUCTION_SYSTEM + context_str
    messages = [{"role": "user", "content": body.message}]

    result = await call_ollama_json(
        system=system + "\n\nRespond with JSON: {\"reply\": \"...\", \"suggestions\": [\"...\"], \"materials_mentioned\": [{\"name\": \"...\", \"category\": \"...\"}]}",
        messages=messages,
        max_tokens=1024,
        temperature=0.3,
        stub={
            "reply": f"Ich verarbeite Ihre Anfrage: {body.message[:100]}",
            "suggestions": ["Material suchen", "Preise vergleichen", "Lieferant bewerten"],
            "materials_mentioned": [],
        },
    )
    return ChatResponse(**result)


@router.post("/chat/stream", dependencies=[Depends(require_internal_secret)])
async def chat_stream(body: ChatRequest):
    """Streaming chat — returns SSE for real-time display."""
    context_str = ""
    if body.context:
        context_str = f"\n\nCurrent context: {json.dumps(body.context, ensure_ascii=False)}"

    system = CONSTRUCTION_SYSTEM + context_str

    async def event_stream():
        async for chunk in call_ollama_stream(system, body.message, temperature=0.3):
            yield f"data: {json.dumps({'text': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


class PhotoAnalysisRequest(BaseModel):
    description: str  # text description of what's in the photo (from mobile OCR/vision)
    project_id: str | None = None


@router.post("/analyze-photo", dependencies=[Depends(require_internal_secret)])
async def analyze_photo(body: PhotoAnalysisRequest):
    """Analyze a construction site photo description to identify needed materials."""
    system = CONSTRUCTION_SYSTEM + """
Given a description of a construction site photo, identify:
1. What materials are visible or needed
2. Potential issues or missing materials
3. Recommended items to order

Respond with JSON: {"materials": [{"name": "...", "category": "...", "quantity_estimate": "...", "urgency": "low|medium|high"}], "observations": "...", "recommendations": ["..."]}"""

    result = await call_ollama_json(
        system=system,
        messages=[{"role": "user", "content": f"Photo description: {body.description}"}],
        max_tokens=1024,
        temperature=0.2,
        stub={
            "materials": [],
            "observations": "Photo analysis requires Ollama model to be loaded.",
            "recommendations": ["Please ensure the Ollama model is running."],
        },
    )
    return result
