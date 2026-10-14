"""
AgentQA Selector Cache Service
Redis + PostgreSQL dual-tier cache with component fingerprinting for cross-repo sharing.
"""

from datetime import datetime, timezone
import hashlib
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from src.core.config import settings
from src.core.redis import cache_get, cache_set, cache_delete
from src.modules.healing.models import HealedSelector


def hash_selector(selector: str) -> str:
    """Generates SHA-256 hash for selector string."""
    return hashlib.sha256(selector.strip().encode("utf-8")).hexdigest()


def normalize_url_pattern(url: str) -> str:
    """Normalizes dynamic IDs/query params from URLs to create clean matching patterns."""
    from urllib.parse import urlparse
    parsed = urlparse(url)
    # Strip query parameters and trailing slash
    path = parsed.path.rstrip("/")
    return f"{parsed.netloc}{path}"


class SelectorCacheService:
    @staticmethod
    async def get_cached_selector(
        url: str,
        original_selector: str,
        component_fingerprint: Optional[str],
        db: AsyncSession
    ) -> Optional[dict]:
        """
        Attempts dual-tier cache resolution:
        1. Redis Fast Cache (URL Pattern + Selector Hash)
        2. Database Persistent Storage
        3. Secondary lookup via Component Fingerprint (Cross-repo intelligence!)
        """
        url_pattern = normalize_url_pattern(url)
        selector_h = hash_selector(original_selector)
        cache_key = f"healing:{url_pattern}:{selector_h}"

        # 1. Fast Cache (Redis)
        cached_data = await cache_get(cache_key)
        if cached_data:
            return cached_data

        # 2. Database Lookup by URL + Hash
        query = select(HealedSelector).where(
            HealedSelector.url_pattern == url_pattern,
            HealedSelector.original_selector_hash == selector_h,
            HealedSelector.is_verified == True
        )
        result = await db.execute(query)
        record = result.scalar_one_or_none()

        if record:
            # Update usage metrics
            record.use_count += 1
            record.last_used_at = datetime.now(timezone.utc)
            await db.commit()

            data = {
                "id": str(record.id),
                "healed_selector": record.healed_selector,
                "selector_type": record.selector_type,
                "confidence": record.confidence,
                "reasoning": "Retrieved from verified selector cache (Level 1 Smart Cache)",
                "strategy_level": 1,
                "is_cached": True
            }
            # Repopulate Redis
            await cache_set(cache_key, data, ttl_seconds=settings.SELECTOR_CACHE_TTL_DAYS * 86400)
            return data

        # 3. Secondary Cross-Repo Lookup: Component Fingerprint
        if component_fingerprint:
            fp_query = select(HealedSelector).where(
                HealedSelector.component_fingerprint == component_fingerprint,
                HealedSelector.is_verified == True
            ).order_by(HealedSelector.confidence.desc())
            fp_result = await db.execute(fp_query)
            fp_record = fp_result.scalar_one_or_none()
            if fp_record:
                fp_record.use_count += 1
                fp_record.last_used_at = datetime.now(timezone.utc)
                await db.commit()

                return {
                    "id": str(fp_record.id),
                    "healed_selector": fp_record.healed_selector,
                    "selector_type": fp_record.selector_type,
                    "confidence": fp_record.confidence * 0.95,  # Slight discount for cross-repo inference
                    "reasoning": "Cross-repo match found via matching component DOM fingerprint",
                    "strategy_level": 1,
                    "is_cached": True
                }

        return None

    @staticmethod
    async def save_healed_selector(
        url: str,
        original_selector: str,
        healed_selector: str,
        selector_type: str,
        confidence: float,
        llm_provider: str,
        component_fingerprint: Optional[str],
        db: AsyncSession,
        project_id: Optional[str] = None
    ) -> HealedSelector:
        """
        Persists a newly discovered healed selector to DB and Redis.
        """
        url_pattern = normalize_url_pattern(url)
        selector_h = hash_selector(original_selector)

        import uuid
        proj_uuid = uuid.UUID(project_id) if project_id else None

        record = HealedSelector(
            project_id=proj_uuid,
            url_pattern=url_pattern,
            original_selector=original_selector,
            original_selector_hash=selector_h,
            healed_selector=healed_selector,
            selector_type=selector_type,
            confidence=confidence,
            llm_provider=llm_provider,
            component_fingerprint=component_fingerprint,
            use_count=1,
            is_verified=True
        )
        db.add(record)
        await db.commit()
        await db.refresh(record)

        # Cache in Redis
        cache_key = f"healing:{url_pattern}:{selector_h}"
        cache_data = {
            "id": str(record.id),
            "healed_selector": healed_selector,
            "selector_type": selector_type,
            "confidence": confidence,
            "reasoning": f"Healed via {llm_provider} AI engine",
            "strategy_level": 2,
            "is_cached": True
        }
        await cache_set(cache_key, cache_data, ttl_seconds=settings.SELECTOR_CACHE_TTL_DAYS * 86400)

        return record


selector_cache_service = SelectorCacheService()
