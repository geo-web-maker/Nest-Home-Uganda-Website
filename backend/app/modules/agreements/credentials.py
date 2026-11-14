"""Credential-based signatures: device biometric (WebAuthn) and password.

A biometric never reaches the server. The phone's OS unlocks a platform authenticator
(Face ID, fingerprint, screen lock) and returns a signed WebAuthn response. We accept it
as signing evidence only when:

* the challenge was derived from this agreement's *current content hash*, so the approval is
  cryptographically tied to the exact version being signed;
* the challenge has not expired;
* the authenticator reports user verification (the biometric / PIN actually happened);
* the origin and RP ID match this deployment.

The challenge is stateless (HMAC over agreement id, content hash, role, nonce and expiry), so
no extra collection is needed. Replay is bounded by the expiry and by the fact that an
agreement can only be signed once per role.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
from typing import Any
from urllib.parse import urlparse

from webauthn import generate_registration_options, options_to_json, verify_registration_response
from webauthn.helpers import bytes_to_base64url
from webauthn.helpers.structs import (
    AuthenticatorAttachment, AuthenticatorSelectionCriteria, ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.core.config import get_settings
from app.core.errors import Conflict, ValidationFailed
from app.core.security import hash_password, verify_password

CHALLENGE_TTL_SECONDS = 300
RP_NAME = "Bloomwell Home Care"


def _derive(label: bytes) -> bytes:
    """Purpose-separated key from the application secret, so one use can never stand in for another."""
    secret = get_settings().secret_key
    if len(secret) < 32:
        raise RuntimeError("A strong application secret is required for signing credentials.")
    return hmac.new(secret.encode(), label, hashlib.sha256).digest()


def _key() -> bytes:
    return _derive(b"nest:agreement-webauthn:v1")


def _challenge(agreement_id: str, content_hash: str, role: str, nonce: str, expires: int) -> bytes:
    payload = f"{agreement_id}|{content_hash}|{role}|{nonce}|{expires}".encode()
    return hmac.new(_key(), payload, hashlib.sha256).digest()


def _hosts() -> list[str]:
    """Hostnames of the public site and the standalone admin (the staff countersign UI)."""
    cfg = get_settings()
    hosts: list[str] = []
    for url in (cfg.frontend_url, cfg.admin_url):
        host = urlparse(url).hostname or ""
        if host and host not in hosts:
            hosts.append(host)
    return hosts


def _rp_id() -> str:
    cfg = get_settings()
    explicit = cfg.webauthn_rp_id.strip()
    if explicit:
        return explicit
    hosts = _hosts()
    if not hosts:
        raise Conflict("Biometric signing is not configured on this server")
    # A passkey RP ID must be a registrable suffix of every origin that uses it, so with the public site
    # and admin on different hosts use their longest shared domain suffix (www.x.com + admin.x.com -> x.com).
    parts = [h.split(".") for h in hosts]
    common: list[str] = []
    for labels in zip(*(reversed(p) for p in parts)):
        if len(set(labels)) != 1:
            break
        common.append(labels[0])
    if len(hosts) == 1 or len(common) < 2:
        return hosts[0]
    return ".".join(reversed(common))


def _origins() -> list[str]:
    cfg = get_settings()
    explicit = [o.strip().rstrip("/") for o in cfg.webauthn_origins.split(",") if o.strip()]
    if explicit:
        return explicit
    origins: list[str] = []
    for url in (cfg.frontend_url, cfg.admin_url):
        parsed = urlparse(url)
        if parsed.scheme and parsed.netloc:
            origin = f"{parsed.scheme}://{parsed.netloc}"
            if origin not in origins:
                origins.append(origin)
    if not origins:
        raise Conflict("Biometric signing is not configured on this server")
    return origins


def issue_passkey_options(agreement_id: str, content_hash: str, role: str, display_name: str) -> dict[str, Any]:
    """Options for navigator.credentials.create(), bound to this exact document version."""
    nonce = secrets.token_urlsafe(16)
    expires = int(time.time()) + CHALLENGE_TTL_SECONDS
    options = generate_registration_options(
        rp_id=_rp_id(), rp_name=RP_NAME,
        user_id=hashlib.sha256(f"{agreement_id}:{role}".encode()).digest(),
        user_name=f"signer-{agreement_id[-8:]}", user_display_name=display_name[:64],
        challenge=_challenge(agreement_id, content_hash, role, nonce, expires),
        timeout=CHALLENGE_TTL_SECONDS * 1000,
        authenticator_selection=AuthenticatorSelectionCriteria(
            authenticator_attachment=AuthenticatorAttachment.PLATFORM,
            resident_key=ResidentKeyRequirement.DISCOURAGED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
    )
    return {"options": json.loads(options_to_json(options)), "challenge_token": f"{nonce}.{expires}"}


def verify_passkey(agreement_id: str, content_hash: str, role: str, challenge_token: str,
                   response: dict[str, Any]) -> dict[str, Any]:
    """Verify the browser's WebAuthn response; return evidence safe to store and show."""
    try:
        nonce, expires_text = challenge_token.rsplit(".", 1)
        expires = int(expires_text)
    except ValueError as exc:
        raise ValidationFailed("The biometric challenge is invalid", {"challenge_token": "invalid"}) from exc
    if expires < int(time.time()):
        raise ValidationFailed("The biometric prompt expired. Try again.", {"challenge_token": "expired"})
    # Resolved before the try so a misconfigured server is reported as such, not as a failed biometric.
    rp_id, origins = _rp_id(), _origins()
    try:
        verified = verify_registration_response(
            credential=response,
            expected_challenge=_challenge(agreement_id, content_hash, role, nonce, expires),
            expected_rp_id=rp_id, expected_origin=origins,
            require_user_verification=True,
        )
    except Exception as exc:  # the library raises several specific errors; none should leak detail
        raise ValidationFailed("Biometric verification failed. Try again or use another method.",
                               {"passkey": "invalid"}) from exc
    return {
        "type": "webauthn", "credential_id": bytes_to_base64url(verified.credential_id),
        "aaguid": str(verified.aaguid), "user_verified": bool(verified.user_verified),
        "device_type": str(getattr(verified.credential_device_type, "value", verified.credential_device_type)),
        "backed_up": bool(verified.credential_backed_up), "rp_id": rp_id,
        "challenge_expires": expires,
    }


def _passphrase_digest(passphrase: str, agreement_id: str, content_hash: str) -> str:
    """HMAC of the passphrase under a server-side key, bound to this agreement and document version.

    Without the server secret a leaked database cannot be attacked offline, and the evidence cannot be
    lifted onto another agreement or another version of the same one.
    """
    message = f"{agreement_id}|{content_hash}|{passphrase}".encode()
    return hmac.new(_derive(b"nest:agreement-passphrase:v1"), message, hashlib.sha256).hexdigest()


def passphrase_evidence(passphrase: str, agreement_id: str, content_hash: str) -> dict[str, Any]:
    """Signer-chosen passphrase. Stored only as Argon2id over a keyed, agreement-bound HMAC.

    No plain text and no length. It shows that the signer set a secret at signing time; the signer
    can later demonstrate it with verify_passphrase_evidence. It does not by itself identify the signer.
    """
    return {"type": "passphrase", "scheme": "argon2id(hmac-sha256)",
            "passphrase_hash": hash_password(_passphrase_digest(passphrase, agreement_id, content_hash))}


def verify_passphrase_evidence(evidence: dict[str, Any], passphrase: str, agreement_id: str,
                               content_hash: str) -> bool:
    """For disputes: does this passphrase match what was set when this version was signed?"""
    stored = evidence.get("passphrase_hash")
    if evidence.get("type") != "passphrase" or not isinstance(stored, str):
        return False
    return verify_password(_passphrase_digest(passphrase, agreement_id, content_hash), stored)


def public_label(method: str, evidence_type: str | None = None) -> str:
    """Wording for the signed record. It must not claim more than the evidence shows."""
    if method == "password":
        # Staff re-enter their own account password (verified); a client only sets a passphrase.
        return "Account password verified" if evidence_type == "account_password" else "Passphrase set by signer"
    return {"drawn": "Drawn signature", "thumbprint": "Thumbprint",
            "biometric": "Device passkey (biometric or screen lock)"}.get(method, method)
