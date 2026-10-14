"""
AgentQA Test Generation Schemas
"""

import uuid
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


class GenerateTestRequest(BaseModel):
    framework: str = Field(default="playwright", description="Target test framework: playwright, cypress")
    language: str = Field(default="typescript", description="typescript, python, javascript")
    add_assertions: bool = True
    page_object_model: bool = True


class GeneratedTestOut(BaseModel):
    id: uuid.UUID
    recording_id: Optional[uuid.UUID]
    project_id: Optional[uuid.UUID]
    title: str
    framework: str
    code: str
    page_objects: dict[str, Any]
    assertions: list[dict[str, Any]]
    created_at: datetime

    class Config:
        from_attributes = True
