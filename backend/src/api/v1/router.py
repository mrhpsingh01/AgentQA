"""
AgentQA API v1 Router Aggregator
"""

from fastapi import APIRouter
from src.modules.auth.router import router as auth_router
from src.modules.projects.router import router as projects_router
from src.modules.recordings.router import router as recordings_router
from src.modules.test_generation.router import router as test_gen_router
from src.modules.healing.router import router as healing_router
from src.modules.test_runner.router import router as runner_router
from src.modules.reporting.router import router as reporting_router
from src.modules.visual_regression.router import router as visual_router

api_v1_router = APIRouter(prefix="/api/v1")

api_v1_router.include_router(auth_router)
api_v1_router.include_router(projects_router)
api_v1_router.include_router(recordings_router)
api_v1_router.include_router(test_gen_router)
api_v1_router.include_router(healing_router)
api_v1_router.include_router(runner_router)
api_v1_router.include_router(reporting_router)
api_v1_router.include_router(visual_router)
