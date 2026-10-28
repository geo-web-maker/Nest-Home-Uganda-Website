"""Rebuild the pre-rendered public site after an admin changes public content.

The public pages are pre-rendered at build time, so an admin edit only reaches the static HTML
after a rebuild. When SITE_REBUILD_HOOK_URL is set (a Cloudflare Pages or Vercel deploy hook) the
backend POSTs to it once the edits go quiet. Several quick edits cause one build, not several.

Single backend instance assumed. A rebuild still pending when the process restarts is lost; the
next public edit, or a manual deploy, triggers it again. The hook URL is a secret: never log it.
"""

import asyncio
import logging

import httpx

from app.core.config import Settings, get_settings

log = logging.getLogger("app.site_rebuild")

WRITE_METHODS = {"POST", "PATCH", "PUT", "DELETE"}
ADMIN_PREFIX = "/api/v1/admin/"
# Admin areas whose data appears on the public site.
PUBLIC_AREAS = {
    "services",
    "pages",
    "faqs",
    "team",
    "testimonials",
    "areas",
    "pricing",
    "articles",
    "jobs",
    "media",
    "settings",
}
# Settings tabs that never reach the public site.
PRIVATE_SETTINGS_TABS = {"sms", "system"}

_pending: asyncio.Task[None] | None = None


def affects_public_site(method: str, path: str, status_code: int) -> bool:
    """True for a successful admin write to content that the public site shows."""
    if method not in WRITE_METHODS or not 200 <= status_code < 300:
        return False
    if not path.startswith(ADMIN_PREFIX):
        return False
    parts = [part for part in path[len(ADMIN_PREFIX) :].split("/") if part]
    if not parts or parts[0] not in PUBLIC_AREAS:
        return False
    return not (parts[0] == "settings" and len(parts) > 1 and parts[1] in PRIVATE_SETTINGS_TABS)


async def _call_hook(url: str) -> None:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(url)
        if response.is_success:
            log.info("site rebuild requested")
        else:
            log.warning("site rebuild hook answered %s", response.status_code)
    except Exception as error:  # a failed hook must never affect the admin's save
        log.warning("site rebuild hook failed: %s", type(error).__name__)


async def _wait_then_call(url: str, delay: float) -> None:
    await asyncio.sleep(delay)
    await _call_hook(url)


def request_rebuild(settings: Settings | None = None) -> None:
    """Schedule (or push back) one rebuild; a no-op without a hook. Needs a running event loop."""
    global _pending
    settings = settings or get_settings()
    if not settings.site_rebuild_hook_url:
        return
    if _pending is not None and not _pending.done():
        _pending.cancel()
    _pending = asyncio.get_running_loop().create_task(
        _wait_then_call(settings.site_rebuild_hook_url, settings.site_rebuild_debounce_seconds)
    )
