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


async def send_push(
    token: str, title: str, body: str, data: dict[str, str] | None = None, *, critical=False
) -> bool:
    settings = get_settings()
    if settings.push_sender != "fcm":
        return False
    account = _service_account()
    assertion = _jwt_assertion(account)
    async with httpx.AsyncClient(timeout=10) as client:
        auth = await client.post(
            account["token_uri"],
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": assertion,
            },
        )
        auth.raise_for_status()
        access = auth.json()["access_token"]
        project = quote(settings.fcm_project_id or account["project_id"], safe="")
        ttl = settings.push_ttl_critical_seconds if critical else settings.push_ttl_normal_seconds
        payload = {
            "message": {
                "token": token,
                "notification": {"title": title, "body": body},
                "data": data or {},
                "android": {
                    "ttl": f"{ttl}s",
                    "priority": "high" if critical else "normal",
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
