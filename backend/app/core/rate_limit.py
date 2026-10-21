"""Fixed-window rate limiter keyed by hashed client IP.

State is in process memory. That is correct for one backend instance (the planned
Render setup). If the backend is ever scaled to several instances, replace
`InMemoryRateLimiter` with a shared store behind the same two methods.
"""

import time
from collections.abc import Callable

from fastapi import Request

from app.core.config import get_settings
from app.core.errors import RateLimited
from app.core.security import hash_ip


class InMemoryRateLimiter:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._hits: dict[str, list[float]] = {}

    def hit(self, key: str, limit: int, window_seconds: int) -> int | None:
        """Record a hit. Return None if allowed, else seconds until the window frees."""
        now = self._clock()
        cutoff = now - window_seconds
        recent = [t for t in self._hits.get(key, []) if t > cutoff]
        if len(recent) >= limit:
            self._hits[key] = recent
            return max(1, int(recent[0] + window_seconds - now) + 1)
        recent.append(now)
        self._hits[key] = recent
        return None

    def reset(self) -> None:
        self._hits.clear()


limiter = InMemoryRateLimiter()


def client_ip(request: Request) -> str:
    if get_settings().trust_proxy:
        forwarded = request.headers.get("x-forwarded-for", "")
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"


def rate_limit(name: str, limit: int, window_seconds: int) -> Callable[[Request], None]:
    """FastAPI dependency: `Depends(rate_limit("login", 10, 900))`."""

    def dependency(request: Request) -> None:
        key = f"{name}:{hash_ip(client_ip(request))}"
        retry_after = limiter.hit(key, limit, window_seconds)
        if retry_after is not None:
            raise RateLimited(retry_after)

    return dependency
