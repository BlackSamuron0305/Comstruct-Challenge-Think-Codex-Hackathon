"""Notification service HTTP client + audit log writer."""
import logging
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models import AuditLog

log = logging.getLogger(__name__)


async def write_audit(
    db: AsyncSession,
    *,
    actor_id: UUID | None,
    actor_role: str | None,
    actor_ip: str | None,
    action: str,
    entity_type: str,
    entity_id: UUID,
    payload: dict | None = None,
) -> None:
    db.add(AuditLog(
        actor_id=actor_id,
        actor_role=actor_role,
        actor_ip=actor_ip,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        payload=payload or {},
    ))


async def notify_event(event: str, payload: dict) -> None:
    """Best-effort push to notification-service. Never blocks order flow."""
    s = get_settings()
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                f"{s.NOTIFICATION_SERVICE_URL}/notify/event",
                json={"event": event, "payload": payload},
                headers={"X-Internal-Secret": s.INTERNAL_SHARED_SECRET},
            )
    except Exception as e:  # noqa: BLE001
        log.warning("notification dispatch failed (non-fatal): %s", e)
