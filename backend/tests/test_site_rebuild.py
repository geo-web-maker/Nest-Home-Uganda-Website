import asyncio

import pytest
import respx
from httpx import Response

from app.core import site_rebuild
from app.core.config import Settings

HOOK = "https://hooks.example.test/deploy/abc"


@pytest.mark.parametrize(
    ("method", "path", "status", "expected"),
    [
        ("PATCH", "/api/v1/admin/services/elder-care", 200, True),
        ("POST", "/api/v1/admin/faqs", 201, True),
        ("DELETE", "/api/v1/admin/testimonials/abc", 204, True),
        ("PATCH", "/api/v1/admin/settings/theme", 200, True),
        ("POST", "/api/v1/admin/settings/theme/reset", 200, True),
        ("PATCH", "/api/v1/admin/settings/sms", 200, False),
        ("PATCH", "/api/v1/admin/settings/system", 200, False),
        ("GET", "/api/v1/admin/services", 200, False),
        ("PATCH", "/api/v1/admin/services/elder-care", 422, False),
        ("POST", "/api/v1/admin/enquiries", 201, False),
        ("PATCH", "/api/v1/admin/care/settings/x", 200, False),
        ("POST", "/api/v1/public/enquiries", 201, False),
    ],
)
def test_only_successful_public_content_writes_trigger_a_rebuild(method, path, status, expected):
    assert site_rebuild.affects_public_site(method, path, status) is expected


async def test_no_hook_url_means_nothing_is_scheduled():
    site_rebuild._pending = None
    site_rebuild.request_rebuild(Settings(site_rebuild_hook_url=""))
    assert site_rebuild._pending is None


@respx.mock
async def test_quick_edits_cause_one_hook_call():
    route = respx.post(HOOK).mock(return_value=Response(200))
    settings = Settings(site_rebuild_hook_url=HOOK, site_rebuild_debounce_seconds=0.05)
    for _ in range(3):
        site_rebuild.request_rebuild(settings)
        await asyncio.sleep(0.01)
    await asyncio.sleep(0.2)
    assert route.call_count == 1


@respx.mock
async def test_a_failing_hook_does_not_raise():
    respx.post(HOOK).mock(return_value=Response(500))
    settings = Settings(site_rebuild_hook_url=HOOK, site_rebuild_debounce_seconds=0.01)
    site_rebuild.request_rebuild(settings)
    await asyncio.sleep(0.1)
