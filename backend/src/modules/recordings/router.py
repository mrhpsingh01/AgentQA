"""
AgentQA Recording Endpoints
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.api.deps import get_db, get_current_user
from src.modules.auth.models import User
from src.modules.recordings.models import Recording
from src.modules.recordings.schemas import RecordingIngest, RecordingOut
from src.modules.recordings.services import recording_service

router = APIRouter(prefix="/recordings", tags=["Recordings"])


@router.post("", response_model=RecordingOut, status_code=status.HTTP_201_CREATED)
async def ingest_recording(
    recording_in: RecordingIngest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Normalize steps
    cleaned_steps = recording_service.normalize_steps(recording_in.steps)

    recording = Recording(
        project_id=recording_in.project_id,
        title=recording_in.title,
        source_url=recording_in.source_url,
        steps=cleaned_steps,
        meta_info=recording_in.meta_info or {}
    )
    db.add(recording)
    await db.commit()
    await db.refresh(recording)
    return recording


@router.get("", response_model=list[RecordingOut])
async def list_recordings(
    project_id: uuid.UUID | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Recording).order_by(Recording.created_at.desc()).limit(50)
    if project_id:
        query = query.where(Recording.project_id == project_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{recording_id}", response_model=RecordingOut)
async def get_recording(
    recording_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    recording = await db.get(Recording, recording_id)
    if not recording:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")
    return recording
