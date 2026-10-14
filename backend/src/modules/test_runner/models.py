"""
AgentQA Test Runner Models
"""

from datetime import datetime, timezone
import uuid
from typing import Any
from sqlalchemy import String, DateTime, Uuid, ForeignKey, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.core.database import Base


class TestRun(Base):
    __tablename__ = "test_runs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    test_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("generated_tests.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending, running, passed, failed, healed
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    results: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    healing_events: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    screenshots: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    error_message: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    test = relationship("GeneratedTest", back_populates="runs")
