"""Signature rendering across BOTH renderers (legacy clauses and structured blocks).

Password/biometric signatures have no image (image_key is None) and must show a
verification stamp; drawn/thumbprint signatures must embed their PNG. This guards the
interaction between the biometric/password signing work and the structured template.
"""
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest

from app.modules.agreements import render
from app.modules.agreements.models import AgreementSignature
from app.modules.agreements.source_blocks import SOURCE_BLOCKS
from app.modules.agreements.source_template import SOURCE_CLAUSES

PNG = b"\x89PNG\r\n\x1a\nfake"


def _sig(role: str, method: str, **extra) -> AgreementSignature:
    return AgreementSignature(role=role, name=f"{role} person", method=method,
                              content_hash="h" * 64, signed_at=datetime(2026, 11, 7, tzinfo=UTC), **extra)


def _agreement(signatures: list[AgreementSignature]):
    return SimpleNamespace(
        reference="BHC-2026-0001", fields={}, signatures=signatures, schedule_b_computed={},
        created_at=datetime(2026, 11, 7, tzinfo=UTC), variation_clause=None, parent_reference=None,
    )


def _render(agreement, *, structured: bool, images=None) -> str:
    blocks = SOURCE_BLOCKS if structured else None
    return render.render_agreement_html(agreement, SOURCE_CLAUSES, blocks=blocks, signed=True,
                                        signature_images=images)


@pytest.mark.parametrize("structured", [False, True], ids=["legacy", "blocks"])
def test_passkey_signature_shows_stamp_and_credential(structured):
    sig = _sig("client", "biometric", verification={"credential_id": "abcdef0123456789"})
    page = _render(_agreement([sig]), structured=structured)
    assert "verified-stamp" in page
    assert "abcdef012345" in page and "abcdef0123456789" not in page  # truncated, never the full id
    assert "<img" not in page.split("Captured signatures", 1)[1]


@pytest.mark.parametrize("structured", [False, True], ids=["legacy", "blocks"])
def test_password_signature_shows_stamp_without_secret_material(structured):
    sig = _sig("bloomwell", "password", verification={"type": "account_password", "verified_user_id": "u1"})
    page = _render(_agreement([sig]), structured=structured)
    assert "verified-stamp" in page and "Electronically signed" in page
    assert "u1" not in page.split("Captured signatures", 1)[1]  # evidence internals are not printed


@pytest.mark.parametrize("structured", [False, True], ids=["legacy", "blocks"])
def test_drawn_signature_embeds_png_and_no_stamp(structured):
    sig = _sig("client", "drawn", image_key="agreements/BHC/signatures/client-1.png")
    page = _render(_agreement([sig]), structured=structured, images={sig.image_key: PNG})
    tail = page.split("Captured signatures", 1)[1]
    assert 'class="signature"' in tail and "data:image/png;base64," in tail
    assert "verified-stamp" not in tail


@pytest.mark.parametrize("structured", [False, True], ids=["legacy", "blocks"])
def test_mixed_methods_and_missing_image_never_crash(structured):
    drawn = _sig("client", "drawn", image_key="k1")
    passkey = _sig("bloomwell", "biometric", verification={"credential_id": "zz"})
    # image bytes unavailable for the drawn signature: still renders the card
    page = _render(_agreement([drawn, passkey]), structured=structured, images={})
    assert page.count('class="sig"') == 2 and "verified-stamp" in page


def test_stamp_style_exists_in_structured_stylesheet():
    page = _render(_agreement([_sig("client", "biometric")]), structured=True)
    assert ".verified-stamp{" in page


@pytest.mark.parametrize("structured", [False, True], ids=["legacy", "blocks"])
def test_client_passphrase_and_staff_password_are_worded_differently(structured):
    client = _sig("client", "password", verification={"type": "passphrase", "passphrase_hash": "$argon2id$secret"})
    staff = _sig("bloomwell", "password", verification={"type": "account_password", "verified_user_id": "u1"})
    page = _render(_agreement([client, staff]), structured=structured)
    assert "Passphrase set by signer" in page and "Account password verified" in page
    assert "$argon2id$secret" not in page
