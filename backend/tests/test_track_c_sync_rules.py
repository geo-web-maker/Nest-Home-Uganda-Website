import pytest

from app.modules.field_ops.router import SyncOperation, SyncPush
from app.modules.field_ops.sync_rules import MAX_SYNC_PUSH_BYTES, sync_payload_too_large


def test_sync_payload_cap_remains_256_kibibytes():
    assert MAX_SYNC_PUSH_BYTES == 262144
    assert not sync_payload_too_large(b"x" * MAX_SYNC_PUSH_BYTES)
    assert sync_payload_too_large(b"x" * (MAX_SYNC_PUSH_BYTES + 1))


@pytest.mark.parametrize(
    "kind", ["check_in", "check_out", "visit_note", "visit_create_adhoc", "sos", "visit_photo"]
)
def test_all_documented_sync_operation_kinds_validate(kind):
    assert SyncOperation(kind=kind, payload={})


def test_sync_batch_is_limited_to_fifty_operations():
    with pytest.raises(ValueError):
        SyncPush(operations=[{"kind": "sos", "payload": {}} for _ in range(51)])
