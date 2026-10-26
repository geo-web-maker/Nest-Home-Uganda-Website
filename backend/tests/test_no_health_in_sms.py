from app.modules.care_ops.sms_templates import BANNED_TERMS, TEMPLATES, render_sms


def test_sms_templates_are_short_and_free_of_health_details_or_client_identifiers():
    for key in TEMPLATES:
        message = render_sms(key, "https://example.invalid/s/ABC123")
        assert len(message) <= 160
        lowered = message.lower()
        assert not any(word in lowered for word in BANNED_TERMS)
        assert "client name" not in lowered and "address" not in lowered
        assert all(ord(char) < 128 for char in message)
