"""
AgentQA Visual Regression Baseline Models
Stores visual baselines per branch and environment.
"""

from datetime import datetime, timezone
import uuid
from sqlalchemy import String, DateTime, Uuid, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.core.database import Base


class VisualBaseline(Base):
    __tablename__ = "visual_baselines"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    branch: Mapped[str] = mapped_column(String(100), default="main", index=True, nullable=False)
    environment: Mapped[str] = mapped_column(String(50), default="staging", index=True, nullable=False)
    step_key: Mapped[str] = mapped_column(String(200), index=True, nullable=False)
    image_base64: Mapped[str] = mapped_column(Text, nullable=False)
    image_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
