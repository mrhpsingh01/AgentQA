"""
AgentQA Recording Schemas
"""

import uuid
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


class RecordingIngest(BaseModel):
    project_id: Optional[uuid.UUID] = None
    title: str = Field(min_length=1, max_length=200, default="Recorded User Flow")
    source_url: str
    steps: list[dict[str, Any]]
    meta_info: Optional[dict[str, Any]] = None


class RecordingOut(BaseModel):
    id: uuid.UUID
    project_id: Optional[uuid.UUID]
    title: str
    source_url: str
    steps: list[dict[str, Any]]
    meta_info: dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True
