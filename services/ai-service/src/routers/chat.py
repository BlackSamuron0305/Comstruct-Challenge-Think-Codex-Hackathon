"""AI Chat router — construction assistant powered by provider-dispatched LLMs.

Provides:
- POST /ai/chat — single-turn construction materials Q&A
- POST /ai/chat/stream — SSE streaming response for real-time UI
- POST /ai/analyze-photo — analyze photo description
- POST /ai/upload-image — upload and analyze a construction site image
- POST /ai/transcribe-audio — transcribe and process audio messages
"""
import base64
import json
import logging
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Header, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..dependencies import require_internal_secret
from ..llm.anthropic_client import call_claude_json
from ..llm.ollama_client import call_ollama_stream, call_ollama_vision

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

Always respond in the user's language. Default to English.
Keep answers practical and actionable for construction site workers.
Use CHF as default currency. Reference Swiss construction norms when relevant."""


class ChatRequest(BaseModel):
    message: str
    context: dict | None = None  # optional: project info, current cart, etc.
    language: str = "en"


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

    result = await call_claude_json(
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

    result = await call_claude_json(
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


# ── Image upload + processing ─────────────────────────────────────────
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/upload-image", dependencies=[Depends(require_internal_secret)])
async def upload_image(
    file: UploadFile = File(...),
    context: str = Form(default=""),
    project_id: str = Form(default=""),
):
    """Upload a construction site image for AI analysis.

    The image is read and sent to the LLM for visual analysis.
    Stub: actual vision API call will be added later (GPT-4o vision / Gemma multimodal).
    Currently returns a stub response based on the filename and context.
    """
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type: {file.content_type}. "
                   f"Allowed: {', '.join(ALLOWED_IMAGE_TYPES)}",
        )

    content = await file.read()
    if len(content) > MAX_IMAGE_SIZE:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Image too large (max 10MB)")

    image_b64 = base64.b64encode(content).decode("utf-8")
    image_size_kb = len(content) / 1024

    logger.info(
        "Image uploaded: %s (%.1f KB, %s)", file.filename, image_size_kb, file.content_type,
    )

    vision_system = CONSTRUCTION_SYSTEM + """
You are analyzing a construction site image. Identify:
1. What materials are visible or being used
2. Potential safety issues or missing materials
3. Items that should be ordered

Respond with JSON: {"materials_detected": [{"name": "...", "category": "...", "quantity_estimate": "...", "urgency": "low|medium|high"}], "observations": "...", "recommendations": ["..."], "confidence": 0.8}"""

    user_prompt = "Analyze this construction site image."
    if context:
        user_prompt += f" Context: {context}"

    stub_response = {
        "materials_detected": [],
        "observations": f"Image '{file.filename}' received ({image_size_kb:.0f} KB). Vision model unavailable.",
        "recommendations": [],
        "confidence": 0.0,
    }

    analysis = await call_ollama_vision(
        system=vision_system,
        user_message=user_prompt,
        image_b64=image_b64,
        max_tokens=1024,
        temperature=0.2,
        stub=stub_response,
    )

    return {
        "status": "processed",
        "filename": file.filename,
        "size_kb": round(image_size_kb, 1),
        "content_type": file.content_type,
        "analysis": analysis,
        "context": context or None,
        "project_id": project_id or None,
    }


# ── Audio transcription + interaction ─────────────────────────────────
ALLOWED_AUDIO_TYPES = {
    "audio/mpeg", "audio/wav", "audio/ogg", "audio/webm",
    "audio/mp4", "audio/m4a", "audio/x-m4a", "audio/aac",
    "application/octet-stream",  # mobile may send this
}
MAX_AUDIO_SIZE = 25 * 1024 * 1024  # 25 MB


@router.post("/transcribe-audio", dependencies=[Depends(require_internal_secret)])
async def transcribe_audio(
    file: UploadFile = File(...),
    language: str = Form(default="de"),
    context: str = Form(default=""),
    respond: bool = Form(default=True),
):
    """Transcribe audio and optionally generate an AI response.

    Flow:
    1. Receive audio file (voice message from mobile/web)
    2. Transcribe to text (stub — will use Whisper or similar)
    3. Optionally pass transcript through construction assistant chat
    4. Return transcript + optional AI reply

    Stub: actual transcription will be done via Whisper API / local model.
    """
    if file.content_type not in ALLOWED_AUDIO_TYPES:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio type: {file.content_type}. "
                   f"Allowed: {', '.join(ALLOWED_AUDIO_TYPES)}",
        )

    content = await file.read()
    if len(content) > MAX_AUDIO_SIZE:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Audio too large (max 25MB)")

    audio_size_kb = len(content) / 1024

    logger.info(
        "Audio uploaded: %s (%.1f KB, %s)", file.filename, audio_size_kb, file.content_type,
    )

    # ── STUB: Transcription API call will go here ──
    # In production: send audio to Whisper API or local whisper model
    # For now, return a placeholder transcript
    transcript = (
        f"[Audio transcript placeholder for '{file.filename}' "
        f"({audio_size_kb:.0f} KB, language={language}). "
        "Whisper transcription will be available when the AI API is connected.]"
    )

    result = {
        "status": "processed",
        "filename": file.filename,
        "size_kb": round(audio_size_kb, 1),
        "content_type": file.content_type,
        "language": language,
        "transcript": transcript,
        "ai_reply": None,
        "note": "Stub response — connect Whisper API for real transcription.",
    }

    # If respond=True, pass the transcript through the chat assistant
    if respond and transcript:
        context_str = ""
        if context:
            context_str = f"\n\nContext: {context}"

        system = CONSTRUCTION_SYSTEM + context_str
        chat_result = await call_claude_json(
            system=system + "\n\nThe user sent a voice message. Respond helpfully. "
            "JSON: {\"reply\": \"...\", \"suggestions\": [\"...\"]}",
            messages=[{"role": "user", "content": transcript}],
            max_tokens=512,
            temperature=0.3,
            stub={
                "reply": "Ich habe Ihre Sprachnachricht erhalten. "
                         "Die Transkription wird verfügbar sein, "
                         "wenn die KI-API verbunden ist.",
                "suggestions": ["Nochmal versuchen", "Text eingeben"],
            },
        )
        result["ai_reply"] = chat_result

    return result
