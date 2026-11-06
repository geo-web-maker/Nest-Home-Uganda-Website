"""Mandatory TOTP session checks for all sensitive audit reads."""
from __future__ import annotations

import hashlib
import hmac
import logging
import time
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException

from app.core.deps import Principal, get_principal
from app.core.errors import Forbidden

log = logging.getLogger("app.security.totp")


def _cookie_key() -> bytes:
    from app.core.config import get_settings
    cfg = get_settings()
    secret = cfg.nest_mail_secret_key or cfg.secret_key
    if len(secret) < 32:
        raise RuntimeError("A strong application/mail secret is required for TOTP sessions.")
    return hmac.new(secret.encode(), b"nest:totp-audit-cookie:v2", hashlib.sha256).digest()


def sign_totp_session(user_id: str, expires: int, enrollment_epoch: int) -> str:
    payload = f"{user_id}:{expires}:{enrollment_epoch}"
    signature = hmac.new(_cookie_key(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}:{signature}"


def _parse_cookie(user_id: str, token: str | None) -> tuple[int, int] | None:
    if not token:
        return None
    try:
        token_user_id, expires, epoch, signature = token.split(":", 3)
        payload = f"{token_user_id}:{expires}:{epoch}"
        expected = hmac.new(_cookie_key(), payload.encode(), hashlib.sha256).hexdigest()
        if token_user_id != user_id or int(expires) <= int(time.time()):
            return None
        if not hmac.compare_digest(signature, expected):
            return None
        return int(expires), int(epoch)
    except Exception:
        return None


def valid_totp_session_cookie(user_id: str, token: str | None) -> bool:
    """Check signature and expiry only. Prefer is_current_totp_session at every route."""
    return _parse_cookie(user_id, token) is not None


async def is_current_totp_session(user_id: str, token: str | None) -> bool:
    parsed = _parse_cookie(user_id, token)
    if parsed is None:
        return False
    try:
        from app.modules.mail.totp import enrollment_epoch
        current = await enrollment_epoch(user_id)
        return current is not None and current == parsed[1]
    except Exception:
        log.exception("TOTP enrollment epoch lookup unavailable")
        return False


async def assert_totp_session(principal: Principal, token: str | None) -> None:
    parsed = _parse_cookie(principal.user_id, token)
    if parsed is None:
        raise Forbidden("Audit access is locked. Verify your authenticator code to continue.")
    try:
        from app.modules.mail.totp import enrollment_epoch
        current = await enrollment_epoch(principal.user_id)
    except Exception as exc:
        log.exception("TOTP enrollment check unavailable for audit access")
        raise HTTPException(status_code=503, detail="Authenticator verification is temporarily unavailable. Audit records remain locked; check the mail database connection and try again.") from exc
    if current is None:
        raise Forbidden("Audit access is locked because an authenticator is not enrolled. Set up TOTP before viewing audit records.")
    if current != parsed[1]:
        raise Forbidden("Audit access is locked. Your authenticator has changed; verify again to continue.")


async def require_totp_session(
    principal: Annotated[Principal, Depends(get_principal)],
    mail_totp: Annotated[str | None, Cookie()] = None,
) -> Principal:
    await assert_totp_session(principal, mail_totp)
    return principal
