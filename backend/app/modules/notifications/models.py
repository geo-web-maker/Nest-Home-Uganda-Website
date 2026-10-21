from datetime import UTC, datetime

from beanie import Document
from pydantic import Field


def _now() -> datetime:
    return datetime.now(UTC)


class SmsLog(Document):
    """One row per SMS attempt (BUILDER_INSTRUCTIONS 13.2). TTL 180 days via migration.

    `to_hint` is masked. The message body is never stored.
    """

    at: datetime = Field(default_factory=_now)
    provider: str
    audience: str  # staff | visitor
    template: str  # new_enquiry | visitor_confirm | reminder
    to_hint: str
    status: str  # sent | failed | skipped
    error: str | None = None
    related_type: str | None = None
    related_id: str | None = None

    class Settings:
        name = "sms_log"
