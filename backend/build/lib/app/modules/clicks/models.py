from beanie import Document
from pydantic import ConfigDict, Field


class ClickStat(Document):
    """Counts only (spec 8.3): one row per UTC day, channel and page. No personal data."""

    date: str  # YYYY-MM-DD, UTC
    channel: str  # call | whatsapp
    page: str
    hits: int = Field(default=0, alias="count")  # stored as `count`; Document.count is taken

    model_config = ConfigDict(populate_by_name=True)

    class Settings:
        name = "click_stats"
