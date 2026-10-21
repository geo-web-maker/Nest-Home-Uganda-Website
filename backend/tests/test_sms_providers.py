"""MamboSmsProvider against httpx.MockTransport. The real API is never called.

Response shapes are the ones in BUILDER_INSTRUCTIONS 13.1.
"""

import json

import httpx
import pytest

from app.modules.notifications.providers import (
    ConsoleSmsProvider,
    MamboSmsProvider,
    get_sms_provider,
)

BASE = "https://api-mongolia.mambosms.com/v1"
OK = {
    "statusCode": 201, "success": True, "messages": ["sent"],
    "data": {"recipients_count": 1, "message_count": 1, "sms_sent": 1, "sms_cost": 32,
             "new_balance": 100, "unsupported_contacts_count": 0, "unsupported_contacts": []},
}  # fmt: skip


def provider(handler, key: str = "secret-key") -> MamboSmsProvider:
    return MamboSmsProvider(BASE, key, transport=httpx.MockTransport(handler))


async def send(p: MamboSmsProvider, to=None, category: str = "info", sender: str = "NestCare"):
    return await p.send(to or ["+256787499988"], "Hello", sender, category)


async def test_request_matches_the_documented_format() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=OK)

    result = await send(provider(handler), ["+256787499988", "+256701234567"])
    assert result.ok and result.cost == 32
    request = seen[0]
    assert str(request.url) == f"{BASE}/send-sms" and request.method == "POST"
    assert request.headers["authorization"] == "secret-key"  # the key alone, no Bearer
    assert json.loads(request.content) == {
        "message": "Hello",
        "recipients": "0787499988,0701234567",  # local format, comma separated, never +256
        "message_category": "info",
        "sender_id": "NestCare",
    }


async def test_http_200_with_success_false_is_a_failure() -> None:
    body = {
        "statusCode": 403,
        "success": False,
        "messages": ["Account is inactive or suspended"],
        "data": [],
    }
    result = await send(provider(lambda r: httpx.Response(200, json=body)))
    assert not result.ok and not result.retryable
    assert "suspended" in (result.error or "")


async def test_unsupported_contacts_is_a_failure() -> None:
    body = json.loads(json.dumps(OK))
    body["data"]["unsupported_contacts_count"] = 1
    result = await send(provider(lambda r: httpx.Response(201, json=body)))
    assert not result.ok and not result.retryable


async def test_401_is_a_permanent_failure() -> None:
    body = {"statusCode": 401, "success": False, "messages": ["Invalid API key"], "data": []}
    result = await send(provider(lambda r: httpx.Response(401, json=body)))
    assert not result.ok and not result.retryable and "Invalid API key" in (result.error or "")


async def test_500_and_timeout_are_retryable() -> None:
    result = await send(
        provider(lambda r: httpx.Response(500, json={"success": False, "messages": ["boom"]}))
    )
    assert not result.ok and result.retryable

    def slow(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    result = await send(provider(slow))
    assert not result.ok and result.retryable and result.error == "timeout"


async def test_non_json_body_is_a_failure_not_a_crash() -> None:
    result = await send(provider(lambda r: httpx.Response(200, text="<html>")))
    assert not result.ok


@pytest.mark.parametrize(
    ("to", "category", "sender"),
    [(["+256312345678"], "info", "NestCare"), (["+256787499988"], "bulk", "NestCare"),
     (["+256787499988"], "info", "TwelveChars12"), (["+256787499988"], "info", "")],
)  # fmt: skip
async def test_bad_input_is_refused_before_any_request(to, category, sender) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise AssertionError("no request may be made")

    assert not (await send(provider(handler), to, category, sender)).ok


async def test_balance() -> None:
    p = provider(lambda r: httpx.Response(200, json={"success": True, "data": {"balance": 480}}))
    assert await p.balance() == 480
    bad = provider(lambda r: httpx.Response(200, json={"success": False, "data": []}))
    with pytest.raises(RuntimeError):
        await bad.balance()


def test_empty_key_is_refused_and_factory_defaults_to_console(monkeypatch) -> None:
    with pytest.raises(ValueError):
        MamboSmsProvider(BASE, "")
    assert isinstance(get_sms_provider(), ConsoleSmsProvider)


async def test_console_provider_sends_nothing_and_succeeds() -> None:
    assert (await ConsoleSmsProvider().send(["+256787499988"], "x", "NestCare", "info")).ok
