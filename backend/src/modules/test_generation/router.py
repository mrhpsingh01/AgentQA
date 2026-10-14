"""
AgentQA Test Generation Endpoints
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.api.deps import get_db, get_current_user
from src.modules.auth.models import User
from src.modules.recordings.models import Recording
from src.modules.test_generation.models import GeneratedTest
from src.modules.test_generation.schemas import GenerateTestRequest, GeneratedTestOut
from src.modules.test_generation.services import test_generation_service

router = APIRouter(prefix="", tags=["Test Generation"])


@router.post("/recordings/{recording_id}/generate", response_model=GeneratedTestOut, status_code=status.HTTP_201_CREATED)
async def generate_test_from_recording(
    recording_id: uuid.UUID,
    req: GenerateTestRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    recording = await db.get(Recording, recording_id)
    if not recording:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")

    result = await test_generation_service.generate_playwright_test(recording)

    generated_test = GeneratedTest(
        project_id=recording.project_id,
        recording_id=recording.id,
        title=result["title"],
        framework=result["framework"],
        code=result["code"],
        page_objects=result["page_objects"],
        assertions=result["assertions"]
    )
    db.add(generated_test)
    await db.commit()
    await db.refresh(generated_test)
    return generated_test


@router.get("/tests", response_model=list[GeneratedTestOut])
async def list_generated_tests(
    project_id: uuid.UUID | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(GeneratedTest).order_by(GeneratedTest.created_at.desc()).limit(50)
    if project_id:
        query = query.where(GeneratedTest.project_id == project_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/tests/{test_id}", response_model=GeneratedTestOut)
async def get_generated_test(
    test_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    test_rec = await db.get(GeneratedTest, test_id)
    if not test_rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test not found")
    return test_rec
