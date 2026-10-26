"""Pure validation helpers for the offline field sync contract."""

MAX_SYNC_PUSH_BYTES = 262144


def sync_payload_too_large(serialized_payload: str | bytes) -> bool:
    payload_bytes = (
        serialized_payload
        if isinstance(serialized_payload, bytes)
        else serialized_payload.encode("utf-8")
    )
    return len(payload_bytes) > MAX_SYNC_PUSH_BYTES
