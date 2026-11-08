from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class AgreementCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enquiry_id: str | None = Field(default=None, max_length=30)
    assigned_nurse_id: str | None = Field(default=None, max_length=30)
    is_test: bool = False


class FieldPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    path: str = Field(min_length=3, max_length=120, pattern=r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$")
    value: Any = None
    expected_revision: int = Field(ge=0)
    entered_by_staff: bool = False


class AgreementPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    changes: list[FieldPatch] = Field(min_length=1, max_length=80)


class SendAgreement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    channels: Literal["email", "sms", "both"] = "both"
    expires_days: int = Field(default=14, ge=1, le=30)


class OtpRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    channel: Literal["sms", "email"] | None = None
    turnstile_token: str | None = Field(default=None, max_length=2048)


class OtpVerify(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(pattern=r"^\d{6}$")


class PublicFieldPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    changes: list[FieldPatch] = Field(min_length=1, max_length=80)


class RequestChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(min_length=5, max_length=2000)


SignMethod = Literal["drawn", "thumbprint", "password", "biometric"]


class _SignatureEvidence(BaseModel):
    """Shared shape: an image for drawn/thumbprint, or a credential for password/biometric."""
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=160)
    method: SignMethod = "drawn"
    signature_base64: str | None = Field(default=None, min_length=100, max_length=1_500_000)
    password: str | None = Field(default=None, min_length=8, max_length=200)
    passkey: dict[str, Any] | None = None  # WebAuthn registration response (JSON form)
    challenge_token: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def evidence_matches_method(self):
        has_image, has_pw, has_key = (self.signature_base64 is not None, self.password is not None,
                                      self.passkey is not None)
        expected = {"drawn": (True, False, False), "thumbprint": (True, False, False),
                    "password": (False, True, False), "biometric": (False, False, True)}[self.method]
        if (has_image, has_pw, has_key) != expected:
            raise ValueError(f"The '{self.method}' signature method needs its own evidence and nothing else")
        if self.method == "biometric" and not self.challenge_token:
            raise ValueError("A biometric signature needs the challenge issued for this document")
        return self


class SignAgreement(_SignatureEvidence):
    role: Literal["client", "representative", "witness", "interpreter"] = "client"
    expected_content_hash: str = Field(min_length=64, max_length=64)
    # The client must tick the electronic-signature consent box. The wording is fixed on the server.
    esign_consent: bool = False


class CountersignAgreement(_SignatureEvidence):
    pass


class PasskeyOptionsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=160)


class VoidAgreement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(min_length=5, max_length=2000)


class TemplateDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    clauses: dict[str, str] = Field(min_length=1, max_length=80)
    source_file: str | None = Field(default=None, max_length=240)

    @field_validator("clauses")
    @classmethod
    def valid_clause_map(cls, value: dict[str, str]) -> dict[str, str]:
        for key, clause in value.items():
            if not key or len(key) > 32 or not clause.strip() or len(clause) > 30_000:
                raise ValueError("Clause keys and text must be non-empty and within the size limit")
        return value


class MessageTemplatePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subject: str = Field(default="", max_length=998)
    preheader: str = Field(default="", max_length=240)
    body: str = Field(default="", max_length=6000)
    button: str = Field(default="", max_length=100)
    footer_note: str = Field(default="", max_length=500)


class AmendmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    variation_clause: str = Field(min_length=1, max_length=120)
