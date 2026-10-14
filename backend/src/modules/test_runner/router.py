"""
AgentQA Test Runner Endpoints
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.api.deps import get_db, get_current_user
from src.core.redis import publish_event
from src.modules.auth.models import User
from src.modules.test_generation.models import GeneratedTest
from src.modules.test_runner.models import TestRun
from src.modules.test_runner.schemas import RunTestRequest, TestRunReport, TestRunOut

router = APIRouter(prefix="/runs", tags=["Test Execution & Runs"])


@router.post("", response_model=TestRunOut, status_code=status.HTTP_201_CREATED)
async def create_test_run(
    req: RunTestRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    test_rec = await db.get(GeneratedTest, req.test_id)
    if not test_rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generated test not found")

    run = TestRun(
        test_id=test_rec.id,
        status="pending",
        duration_ms=0,
        results={"browser": req.browser, "healing_enabled": req.enable_self_healing},
        healing_events=[],
        screenshots=[]
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    # Publish WebSocket notification
    await publish_event(f"run:{run.id}", {"type": "RUN_CREATED", "run_id": str(run.id), "status": "pending"})

    return run


@router.post("/{run_id}/results", response_model=TestRunOut)
async def submit_run_results(
    run_id: uuid.UUID,
    report: TestRunReport,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Invoked by Playwright runner reporter when execution completes.
    """
    run = await db.get(TestRun, run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test run not found")

    run.status = report.status
    run.duration_ms = report.duration_ms
    run.results = report.results
    run.healing_events = report.healing_events
    run.screenshots = report.screenshots
    run.error_message = report.error_message

    await db.commit()
    await db.refresh(run)

    # Broadcast completion via WebSocket
    await publish_event(f"run:{run.id}", {
        "type": "RUN_COMPLETED",
        "run_id": str(run.id),
        "status": run.status,
        "healing_count": len(run.healing_events)
    })

    return run


@router.get("", response_model=list[TestRunOut])
async def list_test_runs(
    test_id: uuid.UUID | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(TestRun).order_by(TestRun.created_at.desc()).limit(50)
    if test_id:
        query = query.where(TestRun.test_id == test_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{run_id}", response_model=TestRunOut)
async def get_test_run(
    run_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    run = await db.get(TestRun, run_id)
    if not run:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Test run not found")
    return run
