"""
AgentQA Recording Models
Stores raw recorded interaction sequences from the Chrome extension.
"""

from datetime import datetime, timezone
import uuid
from typing import Any
from sqlalchemy import String, DateTime, Uuid, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.core.database import Base


class Recording(Base):
    __tablename__ = "recordings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    source_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    steps: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    meta_info: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    project = relationship("Project", back_populates="recordings")
    generated_tests = relationship("GeneratedTest", back_populates="recording", cascade="all, delete-orphan")
