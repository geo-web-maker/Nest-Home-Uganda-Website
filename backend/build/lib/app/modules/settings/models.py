from typing import Any

from app.core.models import TimestampedDocument


class SiteSetting(TimestampedDocument):
    """One editable site setting. The key is unique; values remain JSON-compatible."""

    key: str
    value: Any
    group: str

    class Settings:
        name = "settings"
