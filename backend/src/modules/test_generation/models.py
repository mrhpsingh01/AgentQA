"""
AgentQA Test Generation Models
"""

from datetime import datetime, timezone
import uuid
from typing import Any
from sqlalchemy import String, DateTime, Uuid, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.core.database import Base


class GeneratedTest(Base):
    __tablename__ = "generated_tests"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    recording_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), ForeignKey("recordings.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    framework: Mapped[str] = mapped_column(String(50), default="playwright")  # playwright, cypress, selenium
    code: Mapped[str] = mapped_column(Text, nullable=False)
    page_objects: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    assertions: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    project = relationship("Project", back_populates="tests")
    recording = relationship("Recording", back_populates="generated_tests")
    runs = relationship("TestRun", back_populates="test", cascade="all, delete-orphan")
