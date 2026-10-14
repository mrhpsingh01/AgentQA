"""
AgentQA Project Schemas & Router
"""

import uuid
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.api.deps import get_db, get_current_user
from src.modules.auth.models import User
from src.modules.projects.models import Project


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    repo_url: Optional[str] = None
    settings: Optional[dict[str, Any]] = None


class ProjectOut(BaseModel):
    id: uuid.UUID
    name: str
    repo_url: Optional[str]
    settings: dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True


router = APIRouter(prefix="/projects", tags=["Projects"])


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(
    proj_in: ProjectCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    project = Project(
        user_id=user.id,
        name=proj_in.name,
        repo_url=proj_in.repo_url,
        settings=proj_in.settings or {}
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Project).where(Project.user_id == user.id))
    return result.scalars().all()


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    project = await db.get(Project, project_id)
    if not project or project.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project
