"""Reply threading header tests: In-Reply-To must be a real Message-ID, never an internal row id."""

from email import message_from_bytes
from email.policy import default

from app.modules.mail.core_service import _rfc_message_id
from app.modules.mail.mime_build import build_eml


def test_rfc_message_id_accepts_only_bracketed_ids():
    assert _rfc_message_id("<abc@example.test>") == "<abc@example.test>"
    assert _rfc_message_id("  <abc@example.test> ") == "<abc@example.test>"
    assert _rfc_message_id("3f2c1c0e-9d0b-4b0e-8a57-0d2f9c1b7e11") is None
    assert _rfc_message_id("") is None
    assert _rfc_message_id(None) is None


def _eml(in_reply_to):
    return message_from_bytes(
        build_eml(
            {
                "from_address": "staff@example.test",
                "subject": "Re: Hello",
                "body_text": "Thanks",
                "message_id_header": "<new@example.test>",
                "in_reply_to": in_reply_to,
            },
            [],
            {"to": ["to@example.test"]},
        ),
        policy=default,
    )


def test_build_eml_keeps_valid_in_reply_to():
    assert _eml("<parent@example.test>")["In-Reply-To"] == "<parent@example.test>"


def test_build_eml_drops_internal_row_id_in_reply_to():
    assert _eml("3f2c1c0e-9d0b-4b0e-8a57-0d2f9c1b7e11")["In-Reply-To"] is None
