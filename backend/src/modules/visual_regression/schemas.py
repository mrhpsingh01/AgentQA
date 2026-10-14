"""
AgentQA Visual Regression Schemas
"""

import uuid
from datetime import datetime
from typing import Any, Optional, Literal
from pydantic import BaseModel, Field


class VisualCompareRequest(BaseModel):
    project_id: Optional[uuid.UUID] = None
    branch: str = Field(default="main")
    environment: str = Field(default="staging")
    step_key: str = Field(description="Unique identifier for step or screenshot name")
    screenshot_base64: str = Field(description="Captured screenshot base64")
    mode: Literal["pixel", "semantic"] = "pixel"
    pixel_threshold_pct: float = Field(default=0.1, description="Max allowed pixel difference percentage")


class VisualCompareResponse(BaseModel):
    step_key: str
    has_diff: bool
    diff_percentage: float
    is_baseline_created: bool
    diff_image_base64: Optional[str] = None
    semantic_summary: Optional[str] = None


class VisualBaselineCreate(BaseModel):
    project_id: Optional[uuid.UUID] = None
    branch: str = "main"
    environment: str = "staging"
    step_key: str
    image_base64: str
