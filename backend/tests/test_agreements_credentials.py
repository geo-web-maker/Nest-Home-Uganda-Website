"""Biometric (WebAuthn) and password signature evidence for agreements."""
from __future__ import annotations

import hashlib
import json
import struct
from types import SimpleNamespace

import cbor2
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from pydantic import ValidationError
from webauthn.helpers import bytes_to_base64url

from app.core.errors import ValidationFailed
from app.modules.agreements import credentials
from app.modules.agreements.schemas import CountersignAgreement, SignAgreement

RP_ID = "example.test"
ORIGIN = "https://example.test"
AGREEMENT_ID = "a" * 24
CONTENT_HASH = "b" * 64
PNG = "iVBORw0KGgo" + "A" * 120  # shape only; the schema checks presence, not PNG validity


@pytest.fixture(autouse=True)
def _rp(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(credentials, "_rp_id", lambda: RP_ID)
    monkeypatch.setattr(credentials, "_origins", lambda: [ORIGIN])
    monkeypatch.setattr(credentials, "get_settings", lambda: SimpleNamespace(secret_key="s" * 40))


def _registration(options: dict, *, origin: str = ORIGIN, user_verified: bool = True) -> dict:
    """A valid 'none'-attestation registration response, as a platform authenticator would send."""
    key = ec.generate_private_key(ec.SECP256R1()).public_key().public_numbers()
    cred_id = hashlib.sha256(b"credential").digest()
    cose = cbor2.dumps({1: 2, 3: -7, -1: 1, -2: key.x.to_bytes(32, "big"), -3: key.y.to_bytes(32, "big")})
    flags = 0x01 | 0x40 | (0x04 if user_verified else 0)
    auth_data = (hashlib.sha256(RP_ID.encode()).digest() + bytes([flags]) + struct.pack(">I", 0)
                 + bytes(16) + struct.pack(">H", len(cred_id)) + cred_id + cose)
    client_data = json.dumps({"type": "webauthn.create", "challenge": options["challenge"],
                              "origin": origin, "crossOrigin": False}).encode()
    return {
        "id": bytes_to_base64url(cred_id), "rawId": bytes_to_base64url(cred_id), "type": "public-key",
        "response": {"clientDataJSON": bytes_to_base64url(client_data),
                     "attestationObject": bytes_to_base64url(cbor2.dumps(
                         {"fmt": "none", "attStmt": {}, "authData": auth_data}))},
        "clientExtensionResults": {},
    }


def _issue(role: str = "client") -> dict:
    return credentials.issue_passkey_options(AGREEMENT_ID, CONTENT_HASH, role, "Jane Client")


def test_options_require_user_verification_and_platform_authenticator() -> None:
    options = _issue()["options"]
    selection = options["authenticatorSelection"]
    assert selection["userVerification"] == "required"
    assert selection["authenticatorAttachment"] == "platform"
    assert options["rp"]["id"] == RP_ID


def test_valid_biometric_is_accepted_and_evidence_recorded() -> None:
    issued = _issue()
    evidence = credentials.verify_passkey(AGREEMENT_ID, CONTENT_HASH, "client", issued["challenge_token"],
                                          _registration(issued["options"]))
    assert evidence["type"] == "webauthn" and evidence["user_verified"] is True
    assert evidence["credential_id"] and evidence["rp_id"] == RP_ID


def test_assertion_is_bound_to_the_content_hash() -> None:
    issued = _issue()
    with pytest.raises(ValidationFailed):  # the agreement changed after the prompt was issued
        credentials.verify_passkey(AGREEMENT_ID, "c" * 64, "client", issued["challenge_token"],
                                   _registration(issued["options"]))


def test_assertion_is_bound_to_the_signing_role() -> None:
    issued = _issue("client")
    with pytest.raises(ValidationFailed):
        credentials.verify_passkey(AGREEMENT_ID, CONTENT_HASH, "bloomwell", issued["challenge_token"],
                                   _registration(issued["options"]))


def test_expired_challenge_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    issued = _issue()
    real = credentials.time.time
    monkeypatch.setattr(credentials.time, "time", lambda: real() + credentials.CHALLENGE_TTL_SECONDS + 5)
    with pytest.raises(ValidationFailed):
        credentials.verify_passkey(AGREEMENT_ID, CONTENT_HASH, "client", issued["challenge_token"],
                                   _registration(issued["options"]))


def test_missing_user_verification_is_rejected() -> None:
    issued = _issue()
    with pytest.raises(ValidationFailed):  # presence only, no biometric/PIN
        credentials.verify_passkey(AGREEMENT_ID, CONTENT_HASH, "client", issued["challenge_token"],
                                   _registration(issued["options"], user_verified=False))


def test_wrong_origin_is_rejected() -> None:
    issued = _issue()
    with pytest.raises(ValidationFailed):
        credentials.verify_passkey(AGREEMENT_ID, CONTENT_HASH, "client", issued["challenge_token"],
                                   _registration(issued["options"], origin="https://evil.test"))


def test_tampered_challenge_token_is_rejected() -> None:
    issued = _issue()
    nonce, exp = issued["challenge_token"].rsplit(".", 1)
    with pytest.raises(ValidationFailed):
        credentials.verify_passkey(AGREEMENT_ID, CONTENT_HASH, "client", f"{nonce}x.{exp}",
                                   _registration(issued["options"]))


def test_passphrase_is_never_stored_in_plain_text_or_with_its_length() -> None:
    evidence = credentials.passphrase_evidence("correct horse battery", AGREEMENT_ID, CONTENT_HASH)
    assert "correct horse" not in json.dumps(evidence)
    assert evidence["passphrase_hash"].startswith("$argon2id$")
    assert "length" not in evidence and set(evidence) == {"type", "scheme", "passphrase_hash"}


def test_passphrase_evidence_is_bound_to_this_agreement_and_version() -> None:
    evidence = credentials.passphrase_evidence("correct horse battery", AGREEMENT_ID, CONTENT_HASH)
    ok = credentials.verify_passphrase_evidence
    assert ok(evidence, "correct horse battery", AGREEMENT_ID, CONTENT_HASH)
    assert not ok(evidence, "wrong passphrase", AGREEMENT_ID, CONTENT_HASH)
    assert not ok(evidence, "correct horse battery", "b" * 24, CONTENT_HASH)       # another agreement
    assert not ok(evidence, "correct horse battery", AGREEMENT_ID, "f" * 64)        # another version
    assert not ok({"type": "account_password"}, "correct horse battery", AGREEMENT_ID, CONTENT_HASH)


def test_passphrase_hash_is_keyed_so_a_database_leak_alone_cannot_check_guesses(monkeypatch) -> None:
    from app.core.security import verify_password

    evidence = credentials.passphrase_evidence("correct horse battery", AGREEMENT_ID, CONTENT_HASH)
    # An attacker with only the database tries the passphrase directly, or hashes it without the key.
    assert not verify_password("correct horse battery", evidence["passphrase_hash"])
    plain_digest = hashlib.sha256(f"{AGREEMENT_ID}|{CONTENT_HASH}|correct horse battery".encode()).hexdigest()
    assert not verify_password(plain_digest, evidence["passphrase_hash"])
    # A different server secret cannot verify it either.
    monkeypatch.setattr(credentials, "_derive", lambda label: hashlib.sha256(b"other" + label).digest())
    assert not credentials.verify_passphrase_evidence(evidence, "correct horse battery", AGREEMENT_ID, CONTENT_HASH)


def test_record_labels_do_not_overstate_the_evidence() -> None:
    assert credentials.public_label("password", "passphrase") == "Passphrase set by signer"
    assert credentials.public_label("password") == "Passphrase set by signer"
    assert credentials.public_label("password", "account_password") == "Account password verified"
    assert "Password confirmation" not in {credentials.public_label(m) for m in ("password", "biometric")}


def test_schema_ties_each_method_to_its_own_evidence() -> None:
    base = {"name": "Jane Client", "expected_content_hash": "0" * 64}
    assert SignAgreement(**base, method="drawn", signature_base64=PNG).method == "drawn"
    assert SignAgreement(**base, method="password", password="longenough1").method == "password"
    assert SignAgreement(**base, method="biometric", passkey={"id": "x"}, challenge_token="n.1").method == "biometric"
    for bad in (
        {"method": "drawn"},                                              # image missing
        {"method": "drawn", "signature_base64": PNG, "password": "longenough1"},
        {"method": "password", "signature_base64": PNG},                  # image not allowed
        {"method": "password"},                                           # password missing
        {"method": "biometric", "passkey": {"id": "x"}},                  # challenge missing
        {"method": "biometric", "challenge_token": "n.1"},                # response missing
        {"method": "password", "password": "short"},                      # too short
    ):
        with pytest.raises(ValidationError):
            SignAgreement(**base, **bad)


def test_countersign_schema_accepts_the_same_methods() -> None:
    assert CountersignAgreement(name="Staff Member", method="password", password="Account-pass1").method == "password"
    with pytest.raises(ValidationError):
        CountersignAgreement(name="Staff Member", method="biometric", passkey={"id": "x"})


def test_misconfiguration_is_not_reported_as_a_failed_biometric(monkeypatch):
    import time

    from app.core.errors import Conflict

    def broken() -> str:
        raise Conflict("Biometric signing is not configured on this server")

    monkeypatch.setattr(credentials, "_rp_id", broken)
    with pytest.raises(Conflict):
        credentials.verify_passkey("a" * 24, "h" * 64, "client", f"nonce.{int(time.time()) + 60}", {})
