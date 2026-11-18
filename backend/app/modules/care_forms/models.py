"""Care form instances (the 12 forms and the weekly trackers) and their signatures."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, IndexModel

from app.core.models import TimestampedDocument, utcnow

FormStatus = Literal["draft", "pending", "signed"]


class CareFormInstance(TimestampedDocument):
    form_id: str  # "01".."12" or "tracker"
    client_id: str
    visit_id: str | None = None
    nurse_id: str
    version: int = 1
    status: FormStatus = "draft"
    data: dict[str, Any] = Field(default_factory=dict)
    template_version: str = "1"
    document_hash: str | None = None
    signed_at: datetime | None = None
    superseded: bool = False
    op_id: str | None = None  # client outbox id: makes an offline submit safe to retry

    class Settings:
        name = "care_form_instances"
        indexes = [
            IndexModel([("client_id", ASCENDING), ("form_id", ASCENDING), ("version", ASCENDING)], name="ix_cfi_client_form"),
            IndexModel([("visit_id", ASCENDING)], name="ix_cfi_visit"),
        ]


class CareFormSignature(Document):
    instance_id: str = Field(index=True)
    role: Literal["client", "representative", "interpreter", "witness", "nurse"]
    name: str = Field(min_length=1, max_length=160)
    detail: dict[str, Any] = Field(default_factory=dict)  # authority, interpreter name/address/language, ...
    method: Literal["drawn", "biometric", "password", "thumbprint"]
    evidence: dict[str, Any] = Field(default_factory=dict)
    registration_line: str | None = None  # UNMC line as signed; printed from here, never from the live profile
    signer_email: str | None = None
    esign_consent: bool = False
    document_hash: str
    signed_at: datetime = Field(default_factory=utcnow)

    class Settings:
        name = "care_form_signatures"


class CareFormCopyLog(Document):
    instance_id: str = Field(index=True)
    client_id: str = Field(index=True)
    status: Literal["sent", "failed", "skipped"]
    reason: str | None = None  # never contains health details
    recipient_hint: str | None = None
    at: datetime = Field(default_factory=utcnow)

    class Settings:
        name = "care_form_copy_log"
