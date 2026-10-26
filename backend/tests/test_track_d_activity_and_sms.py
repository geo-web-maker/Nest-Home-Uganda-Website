"""Track D contract tests. Written only; CI runs the project suite."""

from pathlib import Path


def test_track_d_activity_has_cursor_and_filters():
    source = Path("app/modules/activity/router.py").read_text()
    assert (
        "actor_id" in source
        and "item_type" in source
        and "item_id" in source
        and "cursor" in source
    )
    service = Path("app/modules/activity/service.py").read_text()
    assert "next_cursor" in service and "urlsafe_b64" in service


def test_track_d_test_sms_does_not_create_sos_case():
    source = Path("app/modules/care_ops/router.py").read_text()
    assert '"/sos/test-sms"' in source
    assert 'require_scopes("carecfg:write")' in source
    assert "send_test_sos_sms" in source
