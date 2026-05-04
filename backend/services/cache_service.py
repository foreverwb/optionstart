import asyncio
import json
import time
from collections.abc import Awaitable, Callable
from typing import TypeVar

from config import get_settings

try:
    import redis.asyncio as redis
except ImportError:  # pragma: no cover - dependency may be absent in local compile checks
    redis = None


T = TypeVar("T")


class CacheService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._client: object | None = None
        self._memory: dict[str, tuple[float, object]] = {}
        self._lock = asyncio.Lock()

    async def connect(self) -> None:
        if not self.settings.redis_enabled or redis is None:
            return
        self._client = redis.from_url(self.settings.redis_url, decode_responses=True)

    async def close(self) -> None:
        client = self._client
        if client is not None and hasattr(client, "aclose"):
            await client.aclose()
        self._client = None

    async def get_or_set_json(
        self,
        key: str,
        ttl_seconds: int,
        factory: Callable[[], Awaitable[T]],
    ) -> tuple[T, bool]:
        cached = await self.get_json(key)
        if cached is not None:
            return cached, True

        value = await factory()
        await self.set_json(key, value, ttl_seconds)
        return value, False

    async def get_json(self, key: str) -> object | None:
        client = self._client
        if client is not None and hasattr(client, "get"):
            raw = await client.get(key)
            return json.loads(raw) if raw else None

        async with self._lock:
            item = self._memory.get(key)
            if item is None:
                return None
            expires_at, value = item
            if expires_at < time.time():
                self._memory.pop(key, None)
                return None
            return value

    async def set_json(self, key: str, value: object, ttl_seconds: int) -> None:
        client = self._client
        if client is not None and hasattr(client, "setex"):
            await client.setex(key, ttl_seconds, json.dumps(value, default=str))
            return

        async with self._lock:
            self._memory[key] = (time.time() + ttl_seconds, value)


cache_service = CacheService()
