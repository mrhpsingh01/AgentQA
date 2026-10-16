"""
AgentQA Selector Cache Service
Redis + SQL dual-tier cache with component fingerprinting for cross-repo sharing.

Only *verified* heals are ever served. A heal becomes verified when the runner reports that the original
test assertions passed with the repaired selector (``POST /healing/cache/{id}/accept``); until then it is a
pending proposal, so a wrong guess can never poison later runs.
"""

import hashlib
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.core.redis import cache_delete, cache_get, cache_set
from src.modules.healing.models import HealedSelector


def hash_selector(selector: str) -> str:
    """SHA-256 of the selector string."""
    return hashlib.sha256(selector.strip().encode("utf-8")).hexdigest()


def normalize_url_pattern(url: str) -> str:
    """Strip query string / trailing slash so the same page matches across runs."""
    parsed = urlparse(url)
    return f"{parsed.netloc}{parsed.path.rstrip('/')}"


def cache_key(url: str, original_selector: str) -> str:
    return f"healing:{normalize_url_pattern(url)}:{hash_selector(original_selector)}"


class SelectorCacheService:
    @staticmethod
    async def get_cached_selector(
        url: str,
        original_selector: str,
        component_fingerprint: Optional[str],
        db: AsyncSession,
    ) -> Optional[dict]:
        """Verified heals only: Redis -> (url, selector hash) row -> component fingerprint (cross-repo)."""
        key = cache_key(url, original_selector)
        hit = await cache_get(key)
        if hit:
            return hit

        url_pattern = normalize_url_pattern(url)
        row = (
            await db.execute(
                select(HealedSelector).where(
                    HealedSelector.url_pattern == url_pattern,
                    HealedSelector.original_selector_hash == hash_selector(original_selector),
                    HealedSelector.is_verified.is_(True),
                )
            )
        ).scalars().first()

        if row:
            row.use_count += 1
            row.last_used_at = datetime.now(timezone.utc)
            await db.commit()
            data = {
                "id": str(row.id),
                "healed_selector": row.healed_selector,
                "selector_type": row.selector_type,
                "confidence": row.confidence,
                "reasoning": "Served from the verified selector cache (a previous run proved this repair)",
                "strategy_level": 1,
                "is_cached": True,
            }
            await cache_set(key, data, ttl_seconds=settings.SELECTOR_CACHE_TTL_DAYS * 86400)
            return data

        if component_fingerprint:
            fp_row = (
                await db.execute(
                    select(HealedSelector)
                    .where(
                        HealedSelector.component_fingerprint == component_fingerprint,
                        HealedSelector.is_verified.is_(True),
                    )
                    .order_by(HealedSelector.confidence.desc())
                )
            ).scalars().first()
            if fp_row:
                fp_row.use_count += 1
                fp_row.last_used_at = datetime.now(timezone.utc)
                await db.commit()
                return {
                    "id": str(fp_row.id),
                    "healed_selector": fp_row.healed_selector,
                    "selector_type": fp_row.selector_type,
                    "confidence": fp_row.confidence * 0.95,  # discount for cross-repo inference
                    "reasoning": "Verified repair of a component with the same DOM fingerprint (another repository)",
                    "strategy_level": 1,
                    "is_cached": True,
                }
        return None

    @staticmethod
    async def save_pending_selector(
        url: str,
        original_selector: str,
        healed_selector: str,
        selector_type: str,
        confidence: float,
        llm_provider: str,
        component_fingerprint: Optional[str],
        db: AsyncSession,
        project_id: Optional[str] = None,
    ) -> HealedSelector:
        """Persist a proposal as *unverified*. It is served only after ``mark_verified``."""
        record = HealedSelector(
            project_id=uuid.UUID(project_id) if project_id else None,
            url_pattern=normalize_url_pattern(url),
            original_selector=original_selector,
            original_selector_hash=hash_selector(original_selector),
            healed_selector=healed_selector,
            selector_type=selector_type,
            confidence=confidence,
            llm_provider=llm_provider,
            component_fingerprint=component_fingerprint,
            use_count=0,
            is_verified=False,
        )
        db.add(record)
        await db.commit()
        await db.refresh(record)
        return record

    @staticmethod
    async def mark_verified(record: HealedSelector, accepted: bool, db: AsyncSession) -> HealedSelector:
        record.is_verified = accepted
        await db.commit()
        await db.refresh(record)
        key = f"healing:{record.url_pattern}:{record.original_selector_hash}"
        if accepted:
            await cache_set(
                key,
                {
                    "id": str(record.id),
                    "healed_selector": record.healed_selector,
                    "selector_type": record.selector_type,
                    "confidence": record.confidence,
                    "reasoning": "Served from the verified selector cache (a previous run proved this repair)",
                    "strategy_level": 1,
                    "is_cached": True,
                },
                ttl_seconds=settings.SELECTOR_CACHE_TTL_DAYS * 86400,
            )
        else:
            await cache_delete(key)
        return record


selector_cache_service = SelectorCacheService()
