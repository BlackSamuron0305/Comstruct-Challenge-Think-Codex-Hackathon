"""Internal endpoints called by the API gateway for auth + user lookup."""
from uuid import UUID

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..dependencies import require_internal_secret
from ..models import User

router = APIRouter(prefix="/internal/auth", tags=["internal"])


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str
    company_id: UUID


@router.post(
    "/verify-credentials",
    response_model=UserOut,
    dependencies=[Depends(require_internal_secret)],
)
async def verify(body: LoginRequest, db: AsyncSession = Depends(get_session)):
    rows = await db.execute(select(User).where(User.email == body.email))
    user = rows.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(401, "Invalid credentials")
    if not bcrypt.checkpw(body.password.encode("utf-8"), user.password_hash.encode("utf-8")):
        raise HTTPException(401, "Invalid credentials")
    return UserOut(
        id=user.id, email=user.email, full_name=user.full_name,
        role=user.role, company_id=user.company_id,
    )


@router.get(
    "/users/{user_id}",
    response_model=UserOut,
    dependencies=[Depends(require_internal_secret)],
)
async def get_user(user_id: UUID, db: AsyncSession = Depends(get_session)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    return UserOut(
        id=user.id, email=user.email, full_name=user.full_name,
        role=user.role, company_id=user.company_id,
    )
