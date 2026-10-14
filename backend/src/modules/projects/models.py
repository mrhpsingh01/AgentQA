"""
AgentQA Project Models
"""

from datetime import datetime, timezone
import uuid
from typing import Any
from sqlalchemy import String, DateTime, Uuid, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.core.database import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    repo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    settings: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    owner = relationship("User", back_populates="projects")
    recordings = relationship("Recording", back_populates="project", cascade="all, delete-orphan")
    tests = relationship("GeneratedTest", back_populates="project", cascade="all, delete-orphan")
    healed_selectors = relationship("HealedSelector", back_populates="project", cascade="all, delete-orphan")
