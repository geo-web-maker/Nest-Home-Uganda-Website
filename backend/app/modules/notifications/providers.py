"""Provider interfaces and implementations. All MamboSMS knowledge lives in this file.

Facts about the API are recorded in docs/MAMBOSMS_NOTES.md (BUILDER_INSTRUCTIONS 13.1).
Providers never retry; retries are the caller's job (notifications/service.py).
Tests use httpx.MockTransport. Nothing here is called against the real API in tests or CI.
"""

import logging
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.core.config import Settings, get_settings
from app.core.phone import is_mobile, mask, to_local

log = logging.getLogger("app.notifications")

SMS_TIMEOUT_SECONDS = 10.0
CATEGORIES = ("non_customised", "info", "customised")
MAX_SENDER_ID = 11


@dataclass(frozen=True)
class SendResult:
    ok: bool
    error: str | None = None
    retryable: bool = False  # True only for failures a later attempt may fix
    cost: float | None = None


class SmsProvider(Protocol):
    name: str

    async def send(self, to: list[str], text: str, sender_id: str, category: str) -> SendResult:
        """`to` holds normalised +256 numbers. The provider converts to its own format."""
        ...

    async def balance(self) -> int: ...


class ConsoleSmsProvider:
    """Default. Logs a masked hint and the length, never the message body of a real person."""

    name = "console"

    async def send(self, to: list[str], text: str, sender_id: str, category: str) -> SendResult:
        log.info(
            "SMS (console) to=%s sender=%s category=%s chars=%d",
            ",".join(mask(n) for n in to),
            sender_id,
            category,
            len(text),
        )
        return SendResult(ok=True)

    async def balance(self) -> int:
        return 0


class MamboSmsProvider:
    name = "mambosms"

    def __init__(
        self, base_url: str, api_key: str, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        if not api_key:
            raise ValueError("MAMBOSMS_API_KEY is empty")
        self._base = base_url.rstrip("/")
        self._key = api_key
        self._transport = transport

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            timeout=SMS_TIMEOUT_SECONDS,
            transport=self._transport,
            headers={"Authorization": self._key},  # the key alone, no "Bearer" prefix
        )

    async def send(self, to: list[str], text: str, sender_id: str, category: str) -> SendResult:
        if category not in CATEGORIES:
            return SendResult(False, f"unknown message_category '{category}'")
        if len(sender_id) > MAX_SENDER_ID or not sender_id:
            return SendResult(False, "sender_id must be 1 to 11 characters")
        numbers = [n for n in to if is_mobile(n)]
        if not numbers or len(numbers) != len(to):
            return SendResult(False, "recipient is not a Uganda mobile number")
        payload = {
            "message": text,
            "recipients": ",".join(to_local(n) for n in numbers),
            "message_category": category,
            "sender_id": sender_id,
        }
        try:
            async with self._client() as client:
                response = await client.post(f"{self._base}/send-sms", json=payload)
        except httpx.TimeoutException:
            return SendResult(False, "timeout", retryable=True)
        except httpx.HTTPError as exc:
            return SendResult(False, f"network error: {type(exc).__name__}", retryable=True)
        return _parse_send(response)

    async def balance(self) -> int:
        async with self._client() as client:
            response = await client.get(f"{self._base}/accounts/balance")
        response.raise_for_status()
        body = response.json()
        if body.get("success") is not True:
            raise RuntimeError("balance unavailable")
        return int(body["data"]["balance"])


def _messages(body: object) -> str:
    if isinstance(body, dict):
        msgs = body.get("messages")
        if isinstance(msgs, list) and msgs:
            return "; ".join(str(m) for m in msgs)[:300]
    return ""


def _parse_send(response: httpx.Response) -> SendResult:
    """Success only when HTTP is 2xx AND success is true AND no unsupported contacts."""
    try:
        body = response.json()
    except ValueError:
        body = None
    if response.status_code >= 500:
        return SendResult(False, _messages(body) or f"HTTP {response.status_code}", retryable=True)
    if not response.is_success:
        return SendResult(False, _messages(body) or f"HTTP {response.status_code}")
    if not isinstance(body, dict) or body.get("success") is not True:
        return SendResult(False, _messages(body) or "provider reported failure")
    data = body.get("data")
    unsupported = data.get("unsupported_contacts_count", 0) if isinstance(data, dict) else 0
    if unsupported:
        return SendResult(False, "provider does not support this number")
    cost = data.get("sms_cost") if isinstance(data, dict) else None
    return SendResult(True, cost=float(cost) if isinstance(cost, int | float) else None)


class EmailProvider(Protocol):
    name: str

    async def send(self, to: list[str], subject: str, html: str, text: str) -> SendResult: ...


class ConsoleEmailProvider:
    """The only email provider until one is chosen at deploy time (spec 9.8)."""

    name = "console"

    async def send(self, to: list[str], subject: str, html: str, text: str) -> SendResult:
        log.info("EMAIL (console) to=%d recipient(s) subject=%r", len(to), subject)
        return SendResult(ok=True)


def get_sms_provider(settings: Settings | None = None) -> SmsProvider:
    s = settings or get_settings()
    if s.sms_provider == "mambosms":
        return MamboSmsProvider(s.mambosms_base_url, s.mambosms_api_key)
    return ConsoleSmsProvider()


def get_email_provider() -> EmailProvider:
    return ConsoleEmailProvider()
