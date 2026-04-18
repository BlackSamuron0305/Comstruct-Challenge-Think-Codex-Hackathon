from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..dependencies import CurrentUser, current_user
from ..models import Project
from pydantic import BaseModel, ConfigDict

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    site_address: str | None
    trade: str | None


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    user: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    rows = await db.execute(
        select(Project)
        .where(Project.company_id == user.company_id, Project.is_active.is_(True))
        .order_by(Project.name)
    )
    return list(rows.scalars().all())


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: UUID,
    user: CurrentUser = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    p = await db.get(Project, project_id)
    if not p or p.company_id != user.company_id:
        raise HTTPException(404, "Project not found")
    return p
