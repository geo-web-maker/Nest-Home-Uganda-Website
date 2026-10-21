"""Configuration read only from the environment (twelve-factor)."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _split(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    app_env: str = "development"
    mongodb_uri: str = ""
    mongodb_db: str = "nest_home_care"
    secret_key: str = ""
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    cors_origins: str = ""
    frontend_url: str = ""
    ip_hash_salt: str = ""
    trust_proxy: bool = False
    cookie_samesite: str = "lax"  # "none" for a cross-site frontend (needs Secure)
    turnstile_secret: str = ""
    sms_provider: str = Field(default="console")  # "console" or "mambosms"
    mambosms_base_url: str = "https://api-mongolia.mambosms.com/v1"
    mambosms_api_key: str = ""
    sms_sender_id: str = "NestCare"
    sms_message_category: str = "info"
    sms_daily_limit: int = 200
    sms_staff_enabled: bool = True
    sms_visitor_enabled: bool = True
    sms_visitor_text: str = (
        "Thank you for contacting Nest Home Care. A nurse will call you shortly."
    )
    business_whatsapp: str = "256787499988"
    forms_whatsapp_prefix: str = "Hello Nest Home Care, I would like to book"
    notify_reminder_minutes: int = 30
    notify_hours_from: str = "07:00"
    notify_hours_to: str = "20:00"
    scheduler_enabled: bool = True
    seo_index: bool = False
    tz: str = "Africa/Kampala"

    s3_endpoint: str = ""
    s3_region: str = ""
    s3_bucket_public: str = ""
    s3_bucket_private: str = ""
    s3_key: str = ""
    s3_secret: str = ""

    alert_emails: str = ""
    alert_phones: str = ""
    first_superadmin_email: str = ""
    first_superadmin_password: str = ""

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
