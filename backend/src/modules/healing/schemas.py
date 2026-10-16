"""
AgentQA Self-Healing Schemas
"""

import uuid
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class HealingRequest(BaseModel):
    project_id: Optional[uuid.UUID] = None
    url: str
    original_selector: str
    dom_snapshot: str = Field(description="Compressed HTML snapshot (~8KB)")
    error_message: Optional[str] = None
    action_type: str = Field(default="click", description="click, fill, assert, etc.")
    element_info: Optional[dict[str, Any]] = None
    fallback_selectors: Optional[list[list[str]]] = None  # accepted for API compatibility; matched by the runner
    component_fingerprint: Optional[str] = None
    levels: Optional[list[int]] = Field(
        default=None, description="LLM levels to allow (2 = DOM repair, 5 = decompose & rebuild). Default: both."
    )
    min_confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class LevelNote(BaseModel):
    level: int
    name: str
    status: Literal["skipped", "miss", "blocked", "selected"]
    reason: str


class GuardrailInfo(BaseModel):
    allowed: bool
    code: str
    reason: str


class HealingResponse(BaseModel):
    """Outcome of the server-side tiers (verified cache, Level 2, Level 5).

    ``status``:
      healed   - ``healed_selector`` resolves to exactly one element in the snapshot and passed the guardrails
      skipped  - the LLM tiers could not run (no provider configured); nothing was guessed
      blocked  - a candidate existed but a guardrail refused it (see ``guardrail``)
      no_match - the tiers ran and found nothing trustworthy
    A healed selector is only a *proposal*: the runner must still prove it with the test's own assertions.
    """

    status: Literal["healed", "skipped", "blocked", "no_match"]
    healed_selector: Optional[str] = None
    selector_type: Optional[str] = None
    confidence: float = 0.0
    strategy_level: Optional[int] = None  # 1 = verified cache, 2 = LLM DOM repair, 5 = LLM decompose & rebuild
    reasoning: str = ""
    is_cached: bool = False
    cached_id: Optional[uuid.UUID] = None
    steps: list[LevelNote] = Field(default_factory=list)
    guardrail: Optional[GuardrailInfo] = None
    llm_provider: Optional[str] = None
    tokens_estimate: int = 0
    cost_usd_estimate: float = 0.0


class HealingCapabilities(BaseModel):
    llm_configured: bool
    providers: list[str]
    levels: dict[str, str]
    confidence_threshold: float


class HealedSelectorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

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


class CacheAcceptRequest(BaseModel):
    is_accepted: bool = True
