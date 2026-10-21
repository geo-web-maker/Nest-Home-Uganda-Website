"""Documented initial settings. Copy is deliberately limited to text in the build spec."""

from typing import Any

from app.core.config import Settings, get_settings


def _split(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def setting_defaults(runtime: Settings | None = None) -> dict[str, Any]:
    s = runtime or get_settings()
    values: dict[str, Any] = {
        "business.name": "Nest Home Care Uganda",
        "business.tagline": "Trusted · Reliable · Compassionate",
        "business.phone_display": "0787 499 988",
        "business.phone_dial": "+256787499988",
        "business.whatsapp": s.business_whatsapp or "256787499988",
        "business.email": "info@nesthomecare.ug",
        "business.address": "Kampala, Uganda",
        "business.hours": "Add opening hours",
        "business.facebook": "",
        "business.instagram": "",
        "business.location_strip": "Home visits across Kampala and surrounding areas",
        "home.headline": "Care that comes home to you.",
        "home.accent": "comes home",
        "home.btn1": "Book a home visit",
        "home.btn2": "Our services",
        "home.lead": (
            "Trained, caring nurses for your parents, your newborn and your recovery, "
            "in your own home across Kampala."
        ),
        "home.eggs": [
            {"title": "Elders", "caption": "with dignity"},
            {"title": "Newborns", "caption": "and mothers"},
            {"title": "Recovery", "caption": "after surgery"},
        ],
        "home.promise": [
            {"title": "Trusted", "text": "Qualified, ID-wearing nurses"},
            {"title": "Reliable", "text": "On time, every visit"},
            {"title": "Compassionate", "text": "Care with dignity"},
        ],
        "home.show_team": True,
        "home.show_testimonials": False,
        "home.show_sticky_bar": True,
        "forms.who_options": ["self", "parent", "spouse", "child", "other"],
        "forms.start_options": ["today", "this_week", "later", "not_sure"],
        "forms.consent_text": "I agree that Nest Home Care may contact me about this request.",
        "forms.thanks_message": "Thank you. A nurse will contact you shortly.",
        "forms.whatsapp_prefix": s.forms_whatsapp_prefix,
        "forms.open_whatsapp_after": False,
        "forms.save_enquiries": True,
        "forms.require_phone": True,
        "notify.enquiry_emails": _split(s.alert_emails),
        "notify.application_emails": _split(s.alert_emails),
        "notify.sms_number": _split(s.alert_phones),
        "notify.reminder_minutes": s.notify_reminder_minutes,
        "notify.email_new_enquiry": True,
        "notify.daily_summary": True,
        "notify.hours_from": s.notify_hours_from,
        "notify.hours_to": s.notify_hours_to,
        "theme.forest": "#123524",
        "theme.gold": "#C79A3B",
        "theme.leaf": "#1F8A5B",
        "theme.mint": "#DFF0E6",
        "theme.logo": "",
        "theme.favicon": "",
        "seo.home_title": "client to supply",
        "seo.home_description": "client to supply",
        "seo.google_business_url": "",
        "seo.index": s.seo_index,
        "site.default_language": "en",
        "site.languages_enabled": ["en"],
        # The provider is always read from the deployment environment, never stored as a secret.
        "sms.provider": s.sms_provider,
        "sms.sender_id": s.sms_sender_id[:11],
        "sms.message_category": s.sms_message_category,
        "sms.staff_enabled": s.sms_staff_enabled,
        "sms.visitor_enabled": s.sms_visitor_enabled,
        "sms.visitor_text": s.sms_visitor_text,
        "sms.daily_limit": s.sms_daily_limit,
    }
    return values


def setting_group(key: str) -> str:
    return key.split(".", maxsplit=1)[0]
