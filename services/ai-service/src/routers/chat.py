"""AI Chat router — construction assistant powered by local Ollama.

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
import re
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Header, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..dependencies import require_internal_secret
from ..llm.ollama_client import call_ollama_json, call_ollama_stream, call_ollama_vision
from ..llm.openai_client import embed_one
from ..services.catalog_client import search_by_vector, search_products
from ..config import settings

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

STOPWORDS = {
    "what", "which", "with", "from", "that", "this", "need", "for", "and", "the",
    "are", "is", "used", "into", "your", "about", "have", "show", "site", "image",
    "construction", "material", "materials", "please", "give", "help", "project",
}

NON_CONSTRUCTION_HINTS = {
    "laptop", "monitor", "screen", "keyboard", "desk", "office", "chair", "person",
    "face", "computer", "mouse", "tablet", "phone", "room", "curtain", "window",
}

CONSTRUCTION_HINTS = {
    "cement", "concrete", "rebar", "brick", "drywall", "plaster", "pipe", "cable",
    "conduit", "screw", "drill", "timber", "beam", "tile", "pallet", "insulation",
    "scaffold", "ladder", "paint", "mortar", "sheet", "panel", "flooring",
}

UNCERTAINTY_HINTS = {
    "likely", "similar", "unclear", "appears", "suggests", "maybe", "possibly",
}


def _extract_query_terms(text: str, limit: int = 5) -> list[str]:
    terms = re.findall(r"[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9+./-]{2,}", (text or "").lower())
    selected: list[str] = []
    for term in terms:
        if term in STOPWORDS or term in selected:
            continue
        selected.append(term)
        if len(selected) >= limit:
            break
    return selected


def _catalog_item_view(item: dict) -> dict:
    return {
        "id": str(item.get("id") or item.get("product_id") or ""),
        "name": item.get("name"),
        "category": item.get("category"),
        "unit": item.get("unit"),
        "unit_price": item.get("unit_price"),
        "currency": item.get("currency"),
        "sku": item.get("sku"),
    }


def _chat_grounding_meta(products: list[dict], *, grounded: bool) -> dict:
    evidence = [_catalog_item_view(p) for p in products[:3]]
    if grounded and evidence:
        confidence = round(min(0.94, 0.58 + (0.1 * len(evidence))), 2)
        return {
            "grounded": True,
            "confidence": confidence,
            "evidence_note": "Recommendations are grounded in matching live catalog items.",
            "grounded_products": evidence,
            "missing_information": [],
        }

    return {
        "grounded": False,
        "confidence": 0.18,
        "evidence_note": "No precise live catalog match was found yet.",
        "grounded_products": [],
        "missing_information": ["exact dimensions", "required load or application", "delivery timing"],
    }


def _dedupe_products(items: list[dict], limit: int = 8) -> list[dict]:
    seen: set[str] = set()
    deduped: list[dict] = []
    for item in items:
        key = str(item.get("id") or item.get("product_id") or item.get("sku") or item.get("name") or "")
        if not key or key in seen:
            continue
        seen.add(key)
        deduped.append(item)
        if len(deduped) >= limit:
            break
    return deduped


async def _retrieve_catalog_context(query: str, *, limit: int = 6) -> list[dict]:
    if not query.strip():
        return []

    hits: list[dict] = []
    try:
        vector = await embed_one(query)
        hits.extend(await search_by_vector(vector, limit=limit))
    except Exception as e:
        logger.warning("Vector retrieval failed: %s", e)

    for term in _extract_query_terms(query, limit=3):
        try:
            hits.extend(await search_products(term, limit=3))
        except Exception as e:
            logger.warning("Text retrieval failed for '%s': %s", term, e)

    return _dedupe_products(hits, limit=limit)


def _build_chat_fallback(message: str, products: list[dict]) -> dict:
    catalog = [_catalog_item_view(p) for p in products[:3]]
    if catalog:
        names = ", ".join(item["name"] for item in catalog if item.get("name"))
        payload = {
            "reply": f"The live catalog suggests these relevant materials: {names}. Add dimensions, load requirements, or the exact application for a narrower recommendation.",
            "suggestions": [f"Compare {item['name']}" for item in catalog if item.get("name")][:3] or ["Add dimensions"],
            "materials_mentioned": [{"name": item["name"], "category": item.get("category") or "general"} for item in catalog],
        }
        payload.update(_chat_grounding_meta(products, grounded=True))
        return payload

    payload = {
        "reply": "No matching products were found in the live catalog for this request. Please describe the task, substrate, quantity, or dimensions and I will narrow the search.",
        "suggestions": ["Describe the task", "Add dimensions", "Mention quantity"],
        "materials_mentioned": [],
    }
    payload.update(_chat_grounding_meta([], grounded=False))
    return payload


def _sanitize_chat_result(result: dict, products: list[dict]) -> dict:
    allowed = {str(p.get("name") or "").strip().lower(): p for p in products if p.get("name")}
    mentioned = []
    for item in result.get("materials_mentioned", []) or []:
        name = str(item.get("name") or "").strip().lower()
        if name in allowed:
            mentioned.append({
                "name": allowed[name]["name"],
                "category": allowed[name].get("category") or item.get("category") or "general",
            })

    if not products:
        return _build_chat_fallback(result.get("reply", ""), [])

    if not mentioned:
        fallback = _build_chat_fallback(result.get("reply", ""), products)
        return {
            "reply": fallback["reply"],
            "suggestions": fallback["suggestions"],
            "materials_mentioned": fallback["materials_mentioned"],
            "grounded": fallback["grounded"],
            "confidence": fallback["confidence"],
            "evidence_note": fallback["evidence_note"],
            "grounded_products": fallback["grounded_products"],
            "missing_information": fallback["missing_information"],
        }

    payload = {
        "reply": result.get("reply") or _build_chat_fallback("", products)["reply"],
        "suggestions": result.get("suggestions") or [],
        "materials_mentioned": mentioned,
        "missing_information": result.get("missing_information") or [],
    }
    payload.update(_chat_grounding_meta([allowed[item["name"].strip().lower()] for item in mentioned if item.get("name")], grounded=True))
    return payload


def _sanitize_photo_result(result: dict, products: list[dict], description: str) -> dict:
    if not products:
        return _build_photo_fallback(description, [])

    allowed = {str(p.get("name") or "").strip().lower(): p for p in products if p.get("name")}
    cleaned_materials = []
    for item in result.get("materials", []) or result.get("materials_detected", []) or []:
        raw_name = str(item.get("name") or "").strip().lower()
        if raw_name in allowed:
            prod = allowed[raw_name]
            cleaned_materials.append({
                "name": prod["name"],
                "category": prod.get("category") or item.get("category") or "general",
                "quantity_estimate": item.get("quantity_estimate") or 1,
                "urgency": item.get("urgency") or "medium",
            })

    if not cleaned_materials:
        return _build_photo_fallback(description, products)

    return {
        "materials": cleaned_materials,
        "observations": result.get("observations") or "Grounded catalog matches were identified from the description.",
        "recommendations": result.get("recommendations") or [],
    }


def _build_photo_fallback(description: str, products: list[dict]) -> dict:
    urgency = "high" if any(word in (description or "").lower() for word in ("urgent", "asap", "today", "immediately")) else "medium"
    catalog = [_catalog_item_view(p) for p in products[:3]]
    if catalog:
        return {
            "materials": [
                {
                    "name": item["name"],
                    "category": item.get("category") or "general",
                    "quantity_estimate": 1,
                    "urgency": urgency,
                }
                for item in catalog
            ],
            "observations": "Fallback analysis used the written description plus matching catalog items.",
            "recommendations": [f"Verify stock and spec for {item['name']}" for item in catalog],
        }
    return {
        "materials": [],
        "observations": "The description did not provide enough grounded evidence to recommend materials confidently.",
        "recommendations": ["Add a clearer description or include visible materials in text."],
    }


def _looks_non_construction_scene(text: str) -> bool:
    lowered = (text or "").lower()
    non_construction_hits = sum(1 for hint in NON_CONSTRUCTION_HINTS if hint in lowered)
    construction_hits = sum(1 for hint in CONSTRUCTION_HINTS if hint in lowered)
    return non_construction_hits > 0 and construction_hits == 0


def _sanitize_uploaded_image_analysis(result: dict, *, context: str = "", filename: str | None = None) -> dict:
    materials = list(result.get("materials_detected") or result.get("materials") or [])
    observations = str(result.get("observations") or "")
    recommendations = list(result.get("recommendations") or [])
    combined_text = " ".join(
        [
            context or "",
            filename or "",
            observations,
            " ".join(str(item.get("name") or "") for item in materials),
            " ".join(str(item) for item in recommendations),
        ]
    )
    grounded_materials = [
        item for item in materials if str(item.get("product_id") or item.get("sku") or "").strip()
    ]
    uncertainty_hits = sum(1 for hint in UNCERTAINTY_HINTS if hint in combined_text.lower())

    if _looks_non_construction_scene(combined_text) or (not grounded_materials and uncertainty_hits > 0):
        return {
            "materials_detected": [],
            "observations": "The image does not appear to show construction materials or a procurement document, so no order suggestions were generated.",
            "recommendations": [
                "Upload a photo of materials, packaging, a delivery note, or an invoice for better extraction."
            ],
            "confidence": 0.1,
            "is_construction_related": False,
        }

    if not grounded_materials:
        return {
            "materials_detected": [],
            "observations": observations or "The image could not be grounded to live catalog items, so no order suggestions were generated.",
            "recommendations": recommendations or [
                "Try a closer photo of packaging, labels, pallets, or a delivery note for grounded matching."
            ],
            "confidence": min(float(result.get("confidence") or 0.3), 0.25),
            "is_construction_related": False,
        }

    return {
        "materials_detected": grounded_materials,
        "observations": observations or "Grounded catalog matches were identified in the image.",
        "recommendations": recommendations,
        "confidence": max(float(result.get("confidence") or 0.5), 0.6),
        "is_construction_related": True,
    }


def _build_image_fallback(filename: str | None, context: str, products: list[dict], image_size_kb: float) -> dict:
    photo = _build_photo_fallback(context or (filename or ""), products)
    return {
        "materials_detected": photo.get("materials", []),
        "observations": f"Image '{filename or 'upload'}' was processed ({image_size_kb:.0f} KB). Low-confidence fallback grounding was used because the vision model did not return structured output.",
        "recommendations": photo.get("recommendations", []),
        "confidence": 0.35 if photo.get("materials") else 0.1,
        "is_construction_related": bool(photo.get("materials")),
    }


async def _try_openai_transcription(content: bytes, filename: str, content_type: str, language: str) -> str | None:
    if not settings.OPENAI_API_KEY:
        return None

    import httpx as _httpx

    async with _httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
            data={"model": "whisper-1", "language": language},
            files={"file": (filename, content, content_type)},
        )
        response.raise_for_status()
        payload = response.json()
        text = (payload.get("text") or "").strip()
        return text or None


class ChatRequest(BaseModel):
    message: str
    context: dict | None = None  # optional: project info, current cart, etc.
    language: str = "en"


class ChatResponse(BaseModel):
    reply: str
    suggestions: list[str] | None = None
    materials_mentioned: list[dict] | None = None
    grounded: bool = False
    confidence: float | None = None
    evidence_note: str | None = None
    grounded_products: list[dict] | None = None
    missing_information: list[str] | None = None


@router.post("/chat", response_model=ChatResponse, dependencies=[Depends(require_internal_secret)])
async def chat_endpoint(body: ChatRequest):
    """Single-turn construction assistant chat grounded in live catalog context."""
    context_blob = json.dumps(body.context, ensure_ascii=False) if body.context else ""
    context_str = f"\n\nCurrent context: {context_blob}" if context_blob else ""
    catalog_matches = await _retrieve_catalog_context(" ".join(filter(None, [body.message, context_blob])), limit=6)
    catalog_context = json.dumps([_catalog_item_view(item) for item in catalog_matches], ensure_ascii=False)

    system = (
        CONSTRUCTION_SYSTEM
        + context_str
        + f"\n\nPreferred response language: {body.language}."
        + "\nUse the retrieved catalog context when relevant. Never invent SKU, price, or availability. "
          "If the evidence is insufficient, explicitly say what information is missing."
        + f"\n\nRetrieved catalog context:\n{catalog_context}"
    )
    messages = [{"role": "user", "content": body.message}]

    if not catalog_matches:
        return ChatResponse(**_build_chat_fallback(body.message, []))

    result = await call_ollama_json(
        system=system + "\n\nRespond with JSON: {\"reply\": \"...\", \"suggestions\": [\"...\"], \"materials_mentioned\": [{\"name\": \"EXACT CATALOG NAME ONLY\", \"category\": \"...\"}], \"missing_information\": [\"...\"]}",
        messages=messages,
        max_tokens=1024,
        temperature=0.2,
        stub=_build_chat_fallback(body.message, catalog_matches),
    )
    return ChatResponse(**_sanitize_chat_result(result, catalog_matches))


@router.post("/chat/stream", dependencies=[Depends(require_internal_secret)])
async def chat_stream(body: ChatRequest):
    """Streaming chat — returns SSE for real-time display."""
    context_blob = json.dumps(body.context, ensure_ascii=False) if body.context else ""
    context_str = f"\n\nCurrent context: {context_blob}" if context_blob else ""
    catalog_matches = await _retrieve_catalog_context(" ".join(filter(None, [body.message, context_blob])), limit=6)
    catalog_context = json.dumps([_catalog_item_view(item) for item in catalog_matches], ensure_ascii=False)

    system = (
        CONSTRUCTION_SYSTEM
        + context_str
        + f"\n\nPreferred response language: {body.language}."
        + "\nUse only grounded catalog evidence when naming products, prices, or SKUs."
        + f"\n\nRetrieved catalog context:\n{catalog_context}"
    )

    async def event_stream():
        async for chunk in call_ollama_stream(system, body.message, temperature=0.2):
            yield f"data: {json.dumps({'text': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


class PhotoAnalysisRequest(BaseModel):
    description: str  # text description of what's in the photo (from mobile OCR/vision)
    project_id: str | None = None


@router.post("/analyze-photo", dependencies=[Depends(require_internal_secret)])
async def analyze_photo(body: PhotoAnalysisRequest):
    """Analyze a construction site photo description to identify needed materials."""
    catalog_matches = await _retrieve_catalog_context(body.description, limit=6)
    catalog_context = json.dumps([_catalog_item_view(item) for item in catalog_matches], ensure_ascii=False)

    system = CONSTRUCTION_SYSTEM + f"""
Given a description of a construction site photo, identify:
1. What materials are visible or needed
2. Potential issues or missing materials
3. Recommended items to order

Use the retrieved catalog context to ground product names and categories. If the description is too vague, say so.
Retrieved catalog context:
{catalog_context}

Respond with JSON: {{"materials": [{{"name": "...", "category": "...", "quantity_estimate": "...", "urgency": "low|medium|high"}}], "observations": "...", "recommendations": ["..."]}}"""

    if not catalog_matches:
        return _build_photo_fallback(body.description, [])

    result = await call_ollama_json(
        system=system,
        messages=[{"role": "user", "content": f"Photo description: {body.description}"}],
        max_tokens=1024,
        temperature=0.2,
        stub=_build_photo_fallback(body.description, catalog_matches),
    )
    return _sanitize_photo_result(result, catalog_matches, body.description)


# ── Image upload + processing ─────────────────────────────────────────
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB


async def _match_catalog_products(materials: list[dict]) -> list[dict]:
    """Search the catalog for each detected material and attach real product metadata."""
    enriched = []
    for mat in materials:
        name = str(mat.get("name") or "").strip()
        if not name:
            enriched.append(mat)
            continue
        try:
            products = await _retrieve_catalog_context(name, limit=1)
            if products:
                p = _catalog_item_view(products[0])
                mat["product_id"] = p["id"]
                mat["matched_name"] = p.get("name")
                mat["sku"] = p.get("sku") or ""
                mat["unit_price"] = p.get("unit_price")
                mat["currency"] = p.get("currency") or mat.get("currency")
        except Exception as e:
            logger.warning("Catalog search failed for '%s': %s", name, e)
        enriched.append(mat)
    return enriched


@router.post("/upload-image", dependencies=[Depends(require_internal_secret)])
async def upload_image(
    file: UploadFile = File(...),
    context: str = Form(default=""),
    project_id: str = Form(default=""),
):
    """Upload a construction site image for multimodal analysis.

    The image is sent to the configured vision model.
    If the model does not return structured data, the endpoint falls back to
    catalog-grounded suggestions derived from the supplied context.
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
You are analyzing a user-uploaded image for procurement assistance.
First decide whether the image is actually related to construction materials, tools, packaging, delivery notes, invoices, or a site workflow.
If it is not clearly construction-related, do NOT guess and do NOT infer a construction site from a generic office, beverage, laptop, desk, or person photo.

For non-construction images, return JSON exactly like:
{"materials_detected": [], "observations": "This looks like a non-construction image (for example a laptop, drink, desk item, or office object), not a construction material or procurement document.", "recommendations": ["Upload a closer photo of the relevant material, package label, pallet tag, or delivery note."], "confidence": 0.1, "is_construction_related": false}

Never reinterpret a laptop, bottle, cup, desk, keyboard, monitor, or phone as a building material just because it has flat surfaces or rectangular shapes.
Only include materials_detected when visual evidence is strong and the suggestion is appropriate for procurement.
Respond with JSON: {"materials_detected": [{"name": "...", "category": "...", "quantity_estimate": "...", "urgency": "low|medium|high"}], "observations": "...", "recommendations": ["..."], "confidence": 0.8, "is_construction_related": true}"""

    user_prompt = "Analyze this image for construction procurement relevance."
    if context:
        user_prompt += f" Context: {context}"

    fallback_candidates = await _retrieve_catalog_context(
        " ".join(filter(None, [context, file.filename or "", project_id])),
        limit=6,
    )
    stub_response = _build_image_fallback(file.filename, context, fallback_candidates, image_size_kb)

    analysis = await call_ollama_vision(
        system=vision_system,
        user_message=user_prompt,
        image_b64=image_b64,
        max_tokens=1024,
        temperature=0.2,
        stub=stub_response,
        content_type=file.content_type or "image/png",
    )

    if not isinstance(analysis, dict):
        analysis = stub_response

    raw_materials = analysis.get("materials_detected") or analysis.get("materials") or []
    if raw_materials:
        try:
            enriched = await _match_catalog_products(raw_materials)
            analysis["materials_detected"] = enriched
        except Exception as e:
            logger.warning("Catalog matching failed: %s", e)

    analysis = _sanitize_uploaded_image_analysis(
        analysis,
        context=context,
        filename=file.filename,
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

    transcript = None
    note = "No transcription backend configured. Set OPENAI_API_KEY or connect a local speech model."
    try:
        transcript = await _try_openai_transcription(
            content,
            file.filename or "audio.webm",
            file.content_type or "application/octet-stream",
            language,
        )
        if transcript:
            note = "Transcription completed successfully."
    except Exception as e:
        logger.warning("Audio transcription failed: %s", e)
        note = f"Transcription backend unavailable: {e}"

    result = {
        "status": "processed" if transcript else "needs_transcription_backend",
        "filename": file.filename,
        "size_kb": round(audio_size_kb, 1),
        "content_type": file.content_type,
        "language": language,
        "transcript": transcript,
        "ai_reply": None,
        "note": note,
    }

    if respond and transcript:
        context_blob = context.strip()
        catalog_matches = await _retrieve_catalog_context(" ".join(filter(None, [transcript, context_blob])), limit=6)
        system = (
            CONSTRUCTION_SYSTEM
            + (f"\n\nContext: {context_blob}" if context_blob else "")
            + "\nThe user sent a transcribed voice message. Respond helpfully and ground product mentions in catalog evidence when available."
            + f"\n\nRetrieved catalog context:\n{json.dumps([_catalog_item_view(item) for item in catalog_matches], ensure_ascii=False)}"
        )
        chat_result = await call_ollama_json(
            system=system + "\n\nJSON: {\"reply\": \"...\", \"suggestions\": [\"...\"]}",
            messages=[{"role": "user", "content": transcript}],
            max_tokens=512,
            temperature=0.2,
            stub={
                "reply": _build_chat_fallback(transcript, catalog_matches)["reply"],
                "suggestions": _build_chat_fallback(transcript, catalog_matches)["suggestions"],
            },
        )
        result["ai_reply"] = chat_result

    return result
