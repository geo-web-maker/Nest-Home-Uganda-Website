from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from beanie import PydanticObjectId
from pymongo import ASCENDING, DESCENDING, IndexModel
from pydantic import BaseModel, Field

from app.core.models import TimestampedDocument

FieldOwner = Literal["staff", "clinical", "client", "either"]
AgreementStatus = Literal[
    "draft", "sent", "client_in_progress", "client_signed", "completed",
    "changes_requested", "expired", "voided",
]
SignatureRole = Literal["client", "representative", "witness", "interpreter", "bloomwell"]
SignatureMethod = Literal["drawn", "thumbprint", "password", "biometric"]
# Methods that capture a PNG; the others store verification evidence instead.
IMAGE_SIGNATURE_METHODS = frozenset({"drawn", "thumbprint"})


def utcnow() -> datetime:
    return datetime.now(UTC)


class AgreementField(BaseModel):
    value: Any = None
    owner: FieldOwner
    revision: int = 0
    entered_by_staff: bool = False
    updated_at: datetime = Field(default_factory=utcnow)
    updated_by: str | None = None


class AgreementEvent(BaseModel):
    type: str
    at: datetime = Field(default_factory=utcnow)
    actor: str = "system"
    detail: dict[str, Any] = Field(default_factory=dict)
    ip_hash: str | None = None


class AgreementSignature(BaseModel):
    role: SignatureRole
    name: str = Field(min_length=1, max_length=160)
    method: SignatureMethod
    image_key: str | None = None
    # Evidence for non-image methods (passkey credential id, passphrase hash, ...).
    verification: dict[str, Any] = Field(default_factory=dict)
    signed_at: datetime = Field(default_factory=utcnow)
    content_hash: str
    ip_hash: str | None = None
    user_agent: str | None = None
    otp_verified_at: datetime | None = None
    in_person: bool = False
    staff_device_user_id: str | None = None


class Agreement(TimestampedDocument):
    reference: str
    status: AgreementStatus = "draft"
    template_version: int = 0
    template_hash: str = ""
    enquiry_id: PydanticObjectId | None = None
    created_by: PydanticObjectId
    assigned_nurse_id: PydanticObjectId | None = None
    fields: dict[str, AgreementField] = Field(default_factory=dict)
    schedule_b_computed: dict[str, Any] = Field(default_factory=dict)
    token_hash: str | None = None
    view_token_hash: str | None = None
    token_issued_at: datetime | None = None
    token_expires_at: datetime | None = None
    session_version: int = 0
    channel_preference: Literal["email", "sms", "both"] = "both"
    signatures: list[AgreementSignature] = Field(default_factory=list)
    sealed: dict[str, Any] = Field(default_factory=dict)
    events: list[AgreementEvent] = Field(default_factory=list)
    expires_at: datetime | None = None
    completed_at: datetime | None = None
    voided_at: datetime | None = None
    void_reason: str | None = None
    parent_agreement_id: PydanticObjectId | None = None
    variation_clause: str | None = None

    class Settings:
        name = "agreements"
        indexes = [
            IndexModel([("reference", ASCENDING)], unique=True, name="uq_agreement_reference"),
            IndexModel([("token_hash", ASCENDING)], name="ix_agreement_token"),
            IndexModel([("view_token_hash", ASCENDING)], name="ix_agreement_view_token"),
            IndexModel([("status", ASCENDING), ("expires_at", ASCENDING)], name="ix_agreement_expiry"),
            IndexModel([("fields.client__email.value", ASCENDING)], name="ix_agreement_client_email"),
            IndexModel([("fields.client__phone.value", ASCENDING)], name="ix_agreement_client_phone"),
            IndexModel([("created_at", DESCENDING)], name="ix_agreement_created"),
        ]


class AgreementOtp(TimestampedDocument):
    agreement_id: PydanticObjectId
    purpose: Literal["sign", "view"]
    code_hash: str
    channel: Literal["sms", "email"]
    destination_hint: str
    expires_at: datetime
    attempts: int = 0
    locked_until: datetime | None = None
    used_at: datetime | None = None
    requested_ip_hash: str | None = None

    class Settings:
        name = "agreement_otps"
        indexes = [IndexModel([("agreement_id", ASCENDING), ("purpose", ASCENDING),
                               ("created_at", DESCENDING)], name="ix_agreement_otp_latest")]


class AgreementTemplate(TimestampedDocument):
    version: int
    clauses: dict[str, str] = Field(default_factory=dict)
    # Structured layout (tables, tick boxes, blanks bound to fields). None = legacy clause-only template.
    blocks: list[dict[str, Any]] | None = None
    template_hash: str
    published_at: datetime | None = None
    published_by: PydanticObjectId | None = None
    is_published: bool = False
    source_file: str | None = None

    class Settings:
        name = "agreement_templates"
        indexes = [IndexModel([("version", ASCENDING)], unique=True, name="uq_agreement_template_version")]


class AgreementMessageTemplate(TimestampedDocument):
    stage_key: str
    channel: Literal["email", "sms"]
    locale: str = "en"
    subject: str = ""
    preheader: str = ""
    body: str = ""
    button: str = ""
    footer_note: str = ""
    version: int = 1
    updated_by: PydanticObjectId | None = None
    is_default: bool = False

    class Settings:
        name = "agreement_message_templates"
        indexes = [IndexModel([("stage_key", ASCENDING), ("channel", ASCENDING),
                               ("locale", ASCENDING)], unique=True, name="uq_agreement_message_template")]
