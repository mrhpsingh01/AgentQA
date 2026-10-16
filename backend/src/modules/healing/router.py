"""
AgentQA Self-Healing Endpoints
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.deps import get_current_user, get_db
from src.modules.auth.models import User
from src.modules.healing.cache import selector_cache_service
from src.modules.healing.models import HealedSelector
from src.modules.healing.schemas import (
    CacheAcceptRequest,
    HealedSelectorOut,
    HealingCapabilities,
    HealingRequest,
    HealingResponse,
)
from src.modules.healing.service import healing_service

router = APIRouter(prefix="/healing", tags=["Self-Healing Engine"])


@router.get("/capabilities", response_model=HealingCapabilities)
async def healing_capabilities(user: User = Depends(get_current_user)):
    """Which ladder levels this server can run right now (LLM levels need a configured provider)."""
    return healing_service.capabilities()


@router.post("/heal", response_model=HealingResponse)
async def heal_selector_endpoint(
    req: HealingRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Server-side healing tiers: verified cache, Level 2 (LLM DOM repair), Level 5 (LLM decompose & rebuild).
    The deterministic levels (1, 3, 4) run inside the Playwright runner against the live page.
    The returned selector is a proposal: report the outcome via ``/cache/{id}/accept``.
    """
    return await healing_service.heal_selector(req, db)


@router.get("/cache", response_model=list[HealedSelectorOut])
async def list_healed_selectors(
    project_id: uuid.UUID | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
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
    db: AsyncSession = Depends(get_db),
):
    """Called by the runner after the test's own assertions passed (accepted=true) or failed (false)."""
    record = await db.get(HealedSelector, selector_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Healed selector not found")
    return await selector_cache_service.mark_verified(record, body.is_accepted, db)


@router.delete("/cache/{selector_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cached_selector(
    selector_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    record = await db.get(HealedSelector, selector_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Healed selector not found")
    await selector_cache_service.mark_verified(record, False, db)
    await db.delete(record)
    await db.commit()
    return None
