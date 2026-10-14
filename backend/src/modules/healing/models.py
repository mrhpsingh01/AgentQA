"""
AgentQA Self-Healing Models
Stores repaired selectors, confidence metrics, and component fingerprints for cross-repo reuse.
"""

from datetime import datetime, timezone
import uuid
from sqlalchemy import String, DateTime, Uuid, ForeignKey, Float, Integer, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.core.database import Base


class HealedSelector(Base):
    __tablename__ = "healed_selectors"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    url_pattern: Mapped[str] = mapped_column(String(500), index=True, nullable=False)
    original_selector: Mapped[str] = mapped_column(Text, nullable=False)
    original_selector_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    healed_selector: Mapped[str] = mapped_column(Text, nullable=False)
    selector_type: Mapped[str] = mapped_column(String(50), default="css")
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    llm_provider: Mapped[str] = mapped_column(String(50), default="unknown")
    component_fingerprint: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    use_count: Mapped[int] = mapped_column(Integer, default=1)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    project = relationship("Project", back_populates="healed_selectors")
