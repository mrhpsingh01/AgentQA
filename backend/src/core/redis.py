"""
AgentQA Redis Connection Pool & Fallback Cache
Provides Redis caching and pub/sub with an automatic in-memory fallback for local development.
"""

import json
import time
from typing import Any, Optional
import structlog
from src.core.config import settings

logger = structlog.get_logger()

# Global redis client reference
_redis_client = None
_in_memory_cache: dict[str, tuple[Any, Optional[float]]] = {}


async def get_redis():
    """Initializes and returns an async Redis connection client."""
    global _redis_client
    if _redis_client is None:
        try:
            import redis.asyncio as aioredis
            _redis_client = aioredis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=2.0
            )
            await _redis_client.ping()
            logger.info("Connected to Redis successfully", url=settings.REDIS_URL)
        except Exception as e:
            logger.warning("Redis not available, using in-memory fallback cache", error=str(e))
            _redis_client = None
    return _redis_client


async def cache_get(key: str) -> Optional[Any]:
    """Retrieves an item from Redis or fallback cache."""
    client = await get_redis()
    if client:
        try:
            val = await client.get(key)
            return json.loads(val) if val else None
        except Exception as e:
            logger.warning("Redis get error, checking fallback", key=key, error=str(e))

    # In-memory fallback
    if key in _in_memory_cache:
        val, expiry = _in_memory_cache[key]
        if expiry is None or expiry > time.time():
            return val
        del _in_memory_cache[key]
    return None


async def cache_set(key: str, value: Any, ttl_seconds: Optional[int] = None) -> None:
    """Stores an item in Redis or fallback cache."""
    client = await get_redis()
    serialized = json.dumps(value)

    if client:
        try:
            if ttl_seconds:
                await client.setex(key, ttl_seconds, serialized)
            else:
                await client.set(key, serialized)
            return
        except Exception as e:
            logger.warning("Redis set error, falling back to memory", key=key, error=str(e))

    # In-memory fallback
    expiry = (time.time() + ttl_seconds) if ttl_seconds else None
    _in_memory_cache[key] = (value, expiry)


async def cache_delete(key: str) -> None:
    """Deletes an item from Redis or fallback cache."""
    client = await get_redis()
    if client:
        try:
            await client.delete(key)
        except Exception:
            pass
    _in_memory_cache.pop(key, None)


async def publish_event(channel: str, message: dict[str, Any]) -> None:
    """Publishes a real-time event to a Redis channel."""
    client = await get_redis()
    if client:
        try:
            await client.publish(channel, json.dumps(message))
        except Exception as e:
            logger.debug("Redis publish skipped (no active broker)", channel=channel, error=str(e))
