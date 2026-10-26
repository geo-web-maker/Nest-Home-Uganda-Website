import pytest

from app.modules.push.retry import MAX_DELIVERY_ATTEMPTS, RETRY_DELAYS_SECONDS, retry_delay_seconds


def test_push_retry_backoff_is_explicit_and_bounded():
    assert RETRY_DELAYS_SECONDS == (30, 120, 600, 1800, 3600)
    assert [retry_delay_seconds(i) for i in range(1, MAX_DELIVERY_ATTEMPTS)] == [
        30,
        120,
        600,
        1800,
        3600,
    ]
    assert retry_delay_seconds(MAX_DELIVERY_ATTEMPTS) is None


def test_push_retry_rejects_non_positive_attempts():
    with pytest.raises(ValueError):
        retry_delay_seconds(0)
