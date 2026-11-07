"""Idempotency receipts for offline operations uploaded by the nurse app."""

from datetime import UTC, datetime
from typing import Any

from beanie import Document
from pydantic import Field


class SyncPushReceipt(Document):
    id: str = Field(index=True, unique=True)  # derived from user id and client_op_id
    user_id: str = Field(index=True)
    client_op_id: str = Field(index=True)
    kind: str
    visit_id: str | None = None
    payload_hash: str | None = None
    result: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC), index=True)

    class Settings:
        name = "field_sync_push_receipts"
