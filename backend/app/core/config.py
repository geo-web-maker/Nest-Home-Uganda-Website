"""Configuration read only from the environment (twelve-factor)."""

import logging
from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _split(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="NEST_", env_file=None, extra="ignore")

    app_env: str = "development"
    mongodb_uri: str = ""
    mongodb_db: str = "nest_home_care"
    care_mongodb_uri: str = ""
    care_mongodb_db: str = "nest_home_care_care"
    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""
    push_sender: str = "fake"
    fcm_project_id: str = ""
    fcm_service_account_json: str = ""
    fcm_service_account_json_b64: str = ""
    push_ttl_critical_seconds: int = 14400
    push_ttl_normal_seconds: int = 86400
    push_channel_critical: str = "nest_critical"
    push_channel_normal: str = "nest_normal"
    b2_endpoint: str = ""
    b2_key: str = ""
    b2_secret: str = ""
    backup_bucket: str = ""
    secret_key: str = ""
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    cors_origins: str = ""
    frontend_url: str = ""
    # Admin application origin; falls back to frontend_url until ADMIN_URL is configured.
    admin_url: str = ""
    # WebAuthn (device biometric signing). Empty = derive from frontend_url.
    webauthn_rp_id: str = ""
    webauthn_origins: str = ""  # comma-separated; empty = frontend_url
    # Optional. Base URL put in nurse invite and reset emails; empty falls back to frontend_url.
    nurse_frontend_url: str = ""
    ip_hash_salt: str = ""
    trust_proxy: bool = False
    trusted_proxy_ips: str = ""  # comma-separated IPs/CIDRs allowed to supply forwarding headers
    cookie_samesite: str = "lax"  # "none" for a cross-site frontend (needs Secure)
    turnstile_secret: str = ""
    turnstile_site_key: str = ""
    sms_provider: str = Field(default="console")  # "console" or "mambosms"
    mambosms_base_url: str = "https://api-mongolia.mambosms.com/v1"
    mambosms_api_key: str = ""
    sms_sender_id: str = "NestCare"
    sms_message_category: str = "info"
    sms_daily_limit: int = 200
    sms_staff_enabled: bool = True
    sms_visitor_enabled: bool = True
    sms_visitor_text: str = (
        "Thank you for contacting Bloomwell Home Care. A nurse will call you shortly."
    )
    business_whatsapp: str = "256787499988"
    business_email: str = ""
    forms_whatsapp_prefix: str = "Hello Bloomwell Home Care, I would like to book"
    notify_reminder_minutes: int = 30
    notify_hours_from: str = "07:00"
    notify_hours_to: str = "20:00"
    scheduler_enabled: bool = True
    seo_index: bool = False
    # Optional deploy hook (Cloudflare Pages or Vercel) called after public content changes.
    site_rebuild_hook_url: str = ""
    site_rebuild_debounce_seconds: float = 300.0
    tz: str = "Africa/Kampala"

    s3_endpoint: str = ""
    s3_region: str = ""
    s3_bucket_public: str = ""
    s3_bucket_private: str = ""
    s3_bucket_mail: str = ""
    s3_key: str = ""
    s3_secret: str = ""
    # Optional separate bucket (e.g. Backblaze B2 with Object Lock enabled) for sealed
    # agreements. Leave s3_bucket_signed empty to keep using the private bucket.
    # The signed_* credentials fall back to the main S3 credentials when empty.
    s3_bucket_signed: str = ""
    s3_signed_endpoint: str = ""
    s3_signed_region: str = ""
    s3_signed_key: str = ""
    s3_signed_secret: str = ""
    s3_signed_retention_days: int = 2555  # about 7 years
    s3_signed_lock_mode: str = "GOVERNANCE"  # or COMPLIANCE (cannot be shortened or removed by anyone)
    agreement_email_attach_pdf: bool = True
    agreement_practice_retention_days: int = 3  # practice agreements are auto-deleted after this many days

    # Dedicated Postgres database and bootstrap-only mail settings. Mail values otherwise
    # live in the Postgres mail_settings table.
    nest_pg_url: str = Field("", validation_alias="NEST_PG_URL")
    mail_migrations_required: bool = False
    nest_mail_secret_key: str = Field("", validation_alias="NEST_MAIL_SECRET_KEY")
    nest_mail_domain: str = Field("", validation_alias="NEST_MAIL_DOMAIN")
    nest_mail_provider: str = Field("console", validation_alias="NEST_MAIL_PROVIDER")
    nest_mail_api_key: str = Field("", validation_alias="NEST_MAIL_API_KEY")

    alert_emails: str = ""
    alert_phones: str = ""
    first_superadmin_email: str = ""
    first_superadmin_password: str = ""

    @model_validator(mode="after")
    def default_admin_url_to_frontend(self) -> "Settings":
        if not self.admin_url.strip():
            self.admin_url = self.frontend_url
            if self.app_env == "production":
                logging.getLogger("app.config").warning(
                    "ADMIN_URL is not set; staff links fall back to FRONTEND_URL and will 404 on the "
                    "standalone admin. Set ADMIN_URL=https://admin.bhcug.com."
                )
        return self

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    @property
    def cors_origin_list(self) -> list[str]:
        return _split(self.cors_origins)

    @property
    def cookie_secure(self) -> bool:
        return not self.is_development


@lru_cache
def get_settings() -> Settings:
    return Settings()
