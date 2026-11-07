"""Pure and bounded retry policy for mobile push deliveries."""

RETRY_DELAYS_SECONDS: tuple[int, ...] = (30, 120, 600, 1800, 3600)
MAX_DELIVERY_ATTEMPTS = len(RETRY_DELAYS_SECONDS) + 1


def retry_delay_seconds(attempt_number: int) -> int | None:
    """Return delay after failed attempt 1..N; None means the retry budget is exhausted."""
    if attempt_number < 1:
        raise ValueError("attempt_number must be positive")
    if attempt_number >= MAX_DELIVERY_ATTEMPTS:
        return None
    return RETRY_DELAYS_SECONDS[attempt_number - 1]
