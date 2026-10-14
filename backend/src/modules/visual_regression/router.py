"""
AgentQA Visual Regression Endpoints
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.api.deps import get_db, get_current_user
from src.modules.auth.models import User
from src.modules.visual_regression.models import VisualBaseline
from src.modules.visual_regression.schemas import VisualCompareRequest, VisualCompareResponse, VisualBaselineCreate
from src.modules.visual_regression.service import visual_service

router = APIRouter(prefix="/visual", tags=["Visual Regression"])


@router.post("/compare", response_model=VisualCompareResponse)
async def compare_visual_screenshot(
    req: VisualCompareRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Compares step screenshot against branch/environment baseline."""
    return await visual_service.compare_screenshot(req, db)


@router.post("/baselines", status_code=status.HTTP_201_CREATED)
async def create_or_update_baseline(
    req: VisualBaselineCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    import hashlib, base64
    img_bytes = base64.b64decode(req.image_base64)
    img_h = hashlib.sha256(img_bytes).hexdigest()

    # Check existing
    result = await db.execute(
        select(VisualBaseline).where(
            VisualBaseline.branch == req.branch,
            VisualBaseline.environment == req.environment,
            VisualBaseline.step_key == req.step_key
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.image_base64 = req.image_base64
        existing.image_hash = img_h
        await db.commit()
        return {"status": "updated", "id": str(existing.id)}

    baseline = VisualBaseline(
        project_id=req.project_id,
        branch=req.branch,
        environment=req.environment,
        step_key=req.step_key,
        image_base64=req.image_base64,
        image_hash=img_h
    )
    db.add(baseline)
    await db.commit()
    await db.refresh(baseline)
    return {"status": "created", "id": str(baseline.id)}


@router.get("/baselines")
async def list_baselines(
    branch: str = "main",
    environment: str = "staging",
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(VisualBaseline).where(
            VisualBaseline.branch == branch,
            VisualBaseline.environment == environment
        )
    )
    baselines = result.scalars().all()
    return [{
        "id": str(b.id),
        "branch": b.branch,
        "environment": b.environment,
        "step_key": b.step_key,
        "created_at": b.created_at
    } for b in baselines]
