"""
Taskiq broker for background jobs (docker-compose ``worker`` service:
``taskiq worker src.tasks.broker:broker``).
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete
from taskiq_redis import ListQueueBroker, RedisAsyncResultBackend

from src.core.config import settings
from src.core.database import async_session_factory
from src.modules.healing.models import HealedSelector

broker = ListQueueBroker(settings.REDIS_URL).with_result_backend(RedisAsyncResultBackend(settings.REDIS_URL))

UNVERIFIED_PROPOSAL_TTL_DAYS = 7


@broker.task(task_name="healing.purge_stale_selectors")
async def purge_stale_selectors() -> int:
    """Delete verified heals unused for SELECTOR_CACHE_TTL_DAYS and unverified proposals older than a week."""
    now = datetime.now(timezone.utc)
    async with async_session_factory() as db:
        stale = delete(HealedSelector).where(
            (HealedSelector.last_used_at < now - timedelta(days=settings.SELECTOR_CACHE_TTL_DAYS))
            | (
                HealedSelector.is_verified.is_(False)
                & (HealedSelector.created_at < now - timedelta(days=UNVERIFIED_PROPOSAL_TTL_DAYS))
            )
        )
        result = await db.execute(stale)
        await db.commit()
        return result.rowcount or 0
