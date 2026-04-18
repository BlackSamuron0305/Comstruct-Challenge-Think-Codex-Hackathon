"""Worker registration router.

Allows new workers to self-register with role specification,
trade details, and device info for offline-first mobile support.
"""
import uuid

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..dependencies import CurrentUser, current_user, require_internal_secret, require_role
from ..models import Company, User, UserRole

router = APIRouter(tags=["registration"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str  # construction_worker, foreman, procurement_worker
    phone: str | None = None
    company_name: str | None = None  # for new companies
    company_id: str | None = None  # join existing company
    # Worker profile fields
    trade: str | None = None
    preferred_language: str = "de"
    glove_size: str | None = None


class RegisterResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    company_id: str
    requires_approval: bool
    message: str


@router.post(
    "/internal/auth/register",
    response_model=RegisterResponse,
    dependencies=[Depends(require_internal_secret)],
)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_session)):
    # Validate role
    allowed_roles = {r.value for r in UserRole}
    if body.role not in allowed_roles:
        raise HTTPException(400, f"Invalid role. Must be one of: {', '.join(allowed_roles)}")

    # Check duplicate email
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Email already registered")

    # Validate password strength
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    # Resolve or create company
    if body.company_id:
        company = await db.get(Company, uuid.UUID(body.company_id))
        if not company:
            raise HTTPException(404, "Company not found")
        company_id = company.id
    elif body.company_name:
        company = Company(name=body.company_name)
        db.add(company)
        await db.flush()
        company_id = company.id
    else:
        raise HTTPException(400, "Either company_id or company_name is required")

    # Hash password
    pw_hash = bcrypt.hashpw(
        body.password.encode("utf-8"),
        bcrypt.gensalt(rounds=12),
    ).decode("utf-8")

    user = User(
        email=body.email,
        password_hash=pw_hash,
        full_name=body.full_name,
        role=body.role,
        company_id=company_id,
        phone=body.phone,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    # Create worker profile if trade/glove info provided
    if body.trade or body.glove_size:
        from sqlalchemy import text
        await db.execute(text("""
            INSERT INTO auth.worker_profiles (id, user_id, trade, preferred_language, glove_size)
            VALUES (:id, :user_id, :trade, :lang, :glove)
        """), {
            "id": uuid.uuid4(),
            "user_id": user.id,
            "trade": body.trade,
            "lang": body.preferred_language,
            "glove": body.glove_size,
        })

    await db.commit()

    return RegisterResponse(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        company_id=str(company_id),
        requires_approval=body.role != UserRole.CONSTRUCTION_WORKER.value,
        message="Registration successful" + (
            ". Account requires admin approval before full access."
            if body.role != UserRole.CONSTRUCTION_WORKER.value else "."
        ),
    )


class UpdateProfileRequest(BaseModel):
    trade: str | None = None
    preferred_language: str | None = None
    glove_size: str | None = None
    device_token: str | None = None
    offline_model_version: str | None = None


@router.put("/internal/auth/profile")
async def update_profile(
    body: UpdateProfileRequest,
    user: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """Update the calling user's worker profile."""
    from sqlalchemy import text

    # Upsert worker profile
    await db.execute(text("""
        INSERT INTO auth.worker_profiles (id, user_id, trade, preferred_language, glove_size, device_token, offline_model_version, updated_at)
        VALUES (:id, :user_id, :trade, :lang, :glove, :token, :model, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
            trade = COALESCE(:trade, auth.worker_profiles.trade),
            preferred_language = COALESCE(:lang, auth.worker_profiles.preferred_language),
            glove_size = COALESCE(:glove, auth.worker_profiles.glove_size),
            device_token = COALESCE(:token, auth.worker_profiles.device_token),
            offline_model_version = COALESCE(:model, auth.worker_profiles.offline_model_version),
            updated_at = NOW()
    """), {
        "id": uuid.uuid4(),
        "user_id": user.id,
        "trade": body.trade,
        "lang": body.preferred_language,
        "glove": body.glove_size,
        "token": body.device_token,
        "model": body.offline_model_version,
    })
    await db.commit()
    return {"status": "updated"}
