"""Fixed-window limiter for general API endpoints, keyed by hashed client IP.

General API rate limits are process-local. Sensitive TOTP operations use the
PostgreSQL-backed limiter in modules.mail.router so limits are shared across workers.
"""

import time
import ipaddress
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
    """Use forwarding headers only when the immediate peer is an explicitly trusted proxy."""
    cfg = get_settings()
    peer = request.client.host if request.client else "unknown"
    if cfg.trust_proxy and peer != "unknown":
        try:
            peer_ip = ipaddress.ip_address(peer)
            trusted = [ipaddress.ip_network(item.strip(), strict=False) for item in cfg.trusted_proxy_ips.split(",") if item.strip()]
            if any(peer_ip in network for network in trusted):
                forwarded = request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for", "")
                candidate = forwarded.split(",")[0].strip()
                try:
                    return str(ipaddress.ip_address(candidate))
                except ValueError:
                    pass
        except ValueError:
            pass
    return peer


def rate_limit(name: str, limit: int, window_seconds: int) -> Callable[[Request], None]:
    """FastAPI dependency: `Depends(rate_limit("login", 10, 900))`."""

    def dependency(request: Request) -> None:
        key = f"{name}:{hash_ip(client_ip(request))}"
        retry_after = limiter.hit(key, limit, window_seconds)
        if retry_after is not None:
            raise RateLimited(retry_after)

    return dependency
