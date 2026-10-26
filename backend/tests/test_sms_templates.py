from app.modules.care_ops.sms_templates import TEMPLATES, render_sms


def test_sms_templates_are_short_and_do_not_contain_health_details():
    for name in TEMPLATES:
        text = render_sms(name, "https://example.invalid/s/short")
        assert len(text) <= 160
        assert "diagnosis" not in text.lower()
        assert "patient name" not in text.lower()
        assert "Client" not in text
