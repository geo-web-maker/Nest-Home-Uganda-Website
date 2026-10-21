from typing import Literal

from pydantic import BaseModel, Field


class ClickIn(BaseModel):
    channel: Literal["call", "whatsapp"]
    page: str = Field(default="/", max_length=120, pattern=r"^/[A-Za-z0-9/_\-.]*$")
