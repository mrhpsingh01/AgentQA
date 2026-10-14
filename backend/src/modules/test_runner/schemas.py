"""
AgentQA Test Runner Schemas
"""

import uuid
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


class RunTestRequest(BaseModel):
    test_id: uuid.UUID
    enable_self_healing: bool = True
    enable_visual_regression: bool = True
    browser: str = Field(default="chromium", description="chromium, firefox, webkit")


class TestRunReport(BaseModel):
    status: str  # passed, failed, healed
    duration_ms: int
    results: dict[str, Any]
    healing_events: list[dict[str, Any]] = []
    screenshots: list[dict[str, Any]] = []
    error_message: Optional[str] = None


class TestRunOut(BaseModel):
    id: uuid.UUID
    test_id: uuid.UUID
    status: str
    duration_ms: int
    results: dict[str, Any]
    healing_events: list[dict[str, Any]]
    screenshots: list[dict[str, Any]]
    error_message: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
