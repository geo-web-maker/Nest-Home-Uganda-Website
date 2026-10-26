from app.modules.care_ops.rules import alert_delivery


def test_critical_never_suppressed_and_warning_obeys_ack_quiet_and_cap():
    assert alert_delivery("critical", True, 0, 15, True, 0)["sms"] is True
    assert alert_delivery("warning", False, 20, 15, False, 1)["sms"] is True
    assert alert_delivery("warning", True, 20, 15, False, 1)["sms"] is False
    assert alert_delivery("warning", False, 20, 15, True, 1)["sms"] is False
    assert alert_delivery("info", False, 20, 15, False, 1)["sms"] is False
