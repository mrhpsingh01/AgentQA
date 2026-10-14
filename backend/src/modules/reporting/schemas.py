"""
AgentQA Reporting & Analytics Schemas
"""

from typing import Any
from pydantic import BaseModel


class OverviewMetrics(BaseModel):
    total_runs: int
    pass_rate_pct: float
    total_healing_events: int
    healing_success_rate_pct: float
    engineer_hours_saved: float
    active_healed_selectors_in_cache: int


class FlakyTestSummary(BaseModel):
    test_id: str
    title: str
    flakiness_score: float  # 0.0 to 1.0
    recent_runs_count: int
    pass_count: int
    fail_count: int
    is_quarantined: bool
