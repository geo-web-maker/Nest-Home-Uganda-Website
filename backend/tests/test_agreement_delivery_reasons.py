from types import SimpleNamespace

from app.modules.agreements import service


def _event(kind, **detail):
    return SimpleNamespace(type=kind, detail=detail)


def test_failure_reasons_report_only_new_failures_per_channel():
    doc = SimpleNamespace(events=[
        _event("message_failed", channel="email", reason="old failure"),
        _event("link_reissued"),
        _event("message_failed", channel="email", reason="Mail is disabled."),
        _event("message_sent", channel="sms"),
    ])
    assert service._failure_reasons(doc, 1) == {"email": "Mail is disabled."}
    assert service._failure_reasons(doc, 4) == {}
