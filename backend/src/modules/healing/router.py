"""
AgentQA Self-Healing Endpoints
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.api.deps import get_db, get_current_user
from src.modules.auth.models import User
from src.modules.healing.models import HealedSelector
from src.modules.healing.schemas import HealingRequest, HealingResponse, HealedSelectorOut, CacheAcceptRequest
from src.modules.healing.service import healing_service

router = APIRouter(prefix="/healing", tags=["Self-Healing Engine"])


@router.post("/heal", response_model=HealingResponse)
async def heal_selector_endpoint(
    req: HealingRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Main self-healing entrypoint.
    Called by Playwright test runner when locator encounters a TimeoutError.
    """
    return await healing_service.heal_selector(req, db)


@router.get("/cache", response_model=list[HealedSelectorOut])
async def list_healed_selectors(
    project_id: uuid.UUID | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(HealedSelector).order_by(HealedSelector.last_used_at.desc()).limit(100)
    if project_id:
        query = query.where(HealedSelector.project_id == project_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/cache/{selector_id}/accept", response_model=HealedSelectorOut)
async def accept_healed_selector(
    selector_id: uuid.UUID,
    body: CacheAcceptRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    record = await db.get(HealedSelector, selector_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Healed selector not found")

    record.is_verified = body.is_accepted
    await db.commit()
    await db.refresh(record)
    return record


@router.delete("/cache/{selector_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cached_selector(
    selector_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    record = await db.get(HealedSelector, selector_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Healed selector not found")

    await db.delete(record)
    await db.commit()
    return None
