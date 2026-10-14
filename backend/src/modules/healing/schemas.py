"""
AgentQA Self-Healing Schemas
"""

import uuid
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


class HealingRequest(BaseModel):
    project_id: Optional[uuid.UUID] = None
    url: str
    original_selector: str
    dom_snapshot: str = Field(description="Compressed HTML snapshot (~8KB)")
    error_message: Optional[str] = None
    action_type: str = Field(default="click", description="click, fill, assert, etc.")
    element_info: Optional[dict[str, Any]] = None
    fallback_selectors: Optional[list[list[str]]] = None
    component_fingerprint: Optional[str] = None


class HealingResponse(BaseModel):
    healed_selector: str
    selector_type: str  # role, testid, css, label, text, xpath
    confidence: float
    strategy_level: int  # 1=smart retry, 2=ai repair, 3=fallback, 4=visual, 5=decompose
    reasoning: str
    is_cached: bool = False
    cached_id: Optional[uuid.UUID] = None


class HealedSelectorOut(BaseModel):
    id: uuid.UUID
    project_id: Optional[uuid.UUID]
    url_pattern: str
    original_selector: str
    healed_selector: str
    selector_type: str
    confidence: float
    llm_provider: str
    use_count: int
    is_verified: bool
    created_at: datetime
    last_used_at: datetime

    class Config:
        from_attributes = True


class CacheAcceptRequest(BaseModel):
    is_accepted: bool = True
