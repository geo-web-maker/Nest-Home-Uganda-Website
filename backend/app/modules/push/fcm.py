"""Firebase Cloud Messaging HTTP v1 sender. Fake mode is the default (no provider calls)."""

import base64
import json
import time
from urllib.parse import quote

import httpx
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import load_pem_private_key

from app.core.config import get_settings


def _service_account():
    settings = get_settings()
    raw = settings.fcm_service_account_json
    if not raw and settings.fcm_service_account_json_b64:
        raw = base64.b64decode(settings.fcm_service_account_json_b64, validate=True).decode("utf-8")
    if not raw:
        raise ValueError("FCM service account is not configured")
    data = json.loads(raw)
    required = {"client_email", "private_key", "token_uri", "project_id"}
    if not required.issubset(data):
        raise ValueError("FCM service account is missing required fields")
    return data


def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _jwt_assertion(account, now=None):
    now = int(now or time.time())
    header = {"alg": "RS256", "typ": "JWT"}
    claim = {
        "iss": account["client_email"],
        "scope": "https://www.googleapis.com/auth/firebase.messaging",
        "aud": account["token_uri"],
        "iat": now,
        "exp": now + 3600,
    }
    header_part = _b64url(json.dumps(header, separators=(",", ":")).encode())
    claim_part = _b64url(json.dumps(claim, separators=(",", ":")).encode())
    unsigned = f"{header_part}.{claim_part}"
    key = load_pem_private_key(account["private_key"].encode(), password=None)
    signature = key.sign(unsigned.encode(), padding.PKCS1v15(), hashes.SHA256())
    return unsigned + "." + _b64url(signature)


async def _access_token(client: httpx.AsyncClient, account) -> str:
    auth = await client.post(
        account["token_uri"],
        data={
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": _jwt_assertion(account),
        },
    )
    auth.raise_for_status()
    return auth.json()["access_token"]


def _fcm_error(response: httpx.Response) -> tuple[str, str]:
    """(error status, message) from an FCM v1 error body, e.g. ("UNREGISTERED", "Requested entity was not found.")."""
    try:
        err = response.json().get("error", {})
    except Exception:
        return "HTTP_" + str(response.status_code), response.text[:200]
    status = err.get("status") or "HTTP_" + str(response.status_code)
    for detail in err.get("details", []) or []:
        if detail.get("errorCode"):
            status = detail["errorCode"]
    return status, str(err.get("message", ""))[:300]


async def send_push_detailed(
    token: str,
    title: str,
    body: str,
    data: dict[str, str] | None = None,
    *,
    critical: bool = False,
    validate_only: bool = False,
    channel_id: str | None = None,
    force_sender: bool = False,
) -> dict:
    """Send one message and report exactly what Google answered. Never raises for provider errors.

    Every push is sent at HIGH priority: normal priority is what idle phones delay. validate_only asks Google to
    check the message and credentials without delivering anything. force_sender lets diagnostics bypass the "fake"
    sender so a real test can be run before the setting is switched on.
    """
    settings = get_settings()
    if settings.push_sender != "fcm" and not force_sender:
        return {"ok": False, "stage": "disabled", "error": "PUSH_SENDER_NOT_FCM",
                "detail": "NEST_PUSH_SENDER is not 'fcm', so nothing is sent to Firebase."}
    try:
        account = _service_account()
    except Exception as exc:
        return {"ok": False, "stage": "credentials", "error": type(exc).__name__, "detail": str(exc)[:200]}
    started = time.time()
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            access = await _access_token(client, account)
        except httpx.HTTPStatusError as exc:
            return {"ok": False, "stage": "google_auth", "error": "GOOGLE_AUTH_REJECTED",
                    "detail": exc.response.text[:300], "http_status": exc.response.status_code}
        except Exception as exc:
            return {"ok": False, "stage": "google_auth", "error": type(exc).__name__, "detail": str(exc)[:200]}
        project = quote(settings.fcm_project_id or account["project_id"], safe="")
        ttl = settings.push_ttl_critical_seconds if critical else settings.push_ttl_normal_seconds
        payload = {
            "validate_only": validate_only,
            "message": {
                "token": token,
                "notification": {"title": title, "body": body},
                "data": data or {},
                "android": {
                    "ttl": f"{ttl}s",
                    "priority": "high",
                    "notification": {
                        "channel_id": channel_id
                        or (settings.push_channel_critical if critical else settings.push_channel_normal)
                    },
                },
            },
        }
        try:
            response = await client.post(
                f"https://fcm.googleapis.com/v1/projects/{project}/messages:send",
                headers={"Authorization": f"Bearer {access}"},
                json=payload,
            )
        except Exception as exc:
            return {"ok": False, "stage": "fcm_send", "error": type(exc).__name__, "detail": str(exc)[:200]}
    elapsed = int((time.time() - started) * 1000)
    if response.status_code == 200:
        return {"ok": True, "stage": "fcm_send", "validate_only": validate_only, "http_status": 200,
                "message_name": response.json().get("name", ""), "elapsed_ms": elapsed}
    status, message = _fcm_error(response)
    return {"ok": False, "stage": "fcm_send", "error": status, "detail": message,
            "http_status": response.status_code, "elapsed_ms": elapsed}


async def send_push(
    token: str, title: str, body: str, data: dict[str, str] | None = None, *, critical=False
) -> bool:
    """Used by the dispatcher. Raises on provider errors so retry/unregistered handling keeps working."""
    settings = get_settings()
    if settings.push_sender != "fcm":
        return False
    account = _service_account()
    async with httpx.AsyncClient(timeout=10) as client:
        access = await _access_token(client, account)
        project = quote(settings.fcm_project_id or account["project_id"], safe="")
        ttl = settings.push_ttl_critical_seconds if critical else settings.push_ttl_normal_seconds
        payload = {
            "message": {
                "token": token,
                "notification": {"title": title, "body": body},
                "data": data or {},
                "android": {
                    "ttl": f"{ttl}s",
                    "priority": "high",
                    "notification": {
                        "channel_id": settings.push_channel_critical
                        if critical
                        else settings.push_channel_normal
                    },
                },
            }
        }
        response = await client.post(
            f"https://fcm.googleapis.com/v1/projects/{project}/messages:send",
            headers={"Authorization": f"Bearer {access}"},
            json=payload,
        )
        response.raise_for_status()
        return True
