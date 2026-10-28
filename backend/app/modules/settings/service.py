"""Settings defaults, public filtering, validation, audit and update rules."""

import re
from collections.abc import Mapping
from typing import Any

from app.core.config import Settings, get_settings
from app.core.deps import Principal
from app.core.errors import Forbidden, ValidationFailed
from app.modules.audit import service as audit
from app.modules.settings import repository as repo
from app.modules.settings.defaults import setting_defaults, setting_group
from app.modules.settings.schemas import PublicSiteSettings, SettingEntry

_GROUPS = {"business", "home", "forms", "notify", "theme", "seo", "site", "sms", "system"}
_PUBLIC_GROUPS = ("business", "home", "forms", "theme", "seo", "site")
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
_EDITABLE_THEME_KEYS = ("theme.forest", "theme.gold", "theme.leaf", "theme.mint")
_BRAND_THEME = {
    "theme.forest": "#123524",
    "theme.gold": "#C79A3B",
    "theme.leaf": "#1F8A5B",
    "theme.mint": "#DFF0E6",
}


def _values_with_defaults(
    persisted: Mapping[str, Any], runtime: Settings | None = None
) -> dict[str, Any]:
    values = setting_defaults(runtime)
    values.update(persisted)
    s = runtime or get_settings()
    values["sms.provider"] = s.sms_provider
    return values


def _luminance(colour: str) -> float:
    channels = [int(colour[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [
        channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4
        for channel in channels
    ]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def contrast_ratio(foreground: str, background: str) -> float:
    light, dark = sorted((_luminance(foreground), _luminance(background)), reverse=True)
    return (light + 0.05) / (dark + 0.05)


def _check_colour(key: str, value: Any) -> None:
    if not isinstance(value, str) or not _HEX.fullmatch(value):
        raise ValidationFailed(
            "Enter a six-digit hex colour, such as #123ABC.", {key: "invalid colour"}
        )


def _check_theme(values: Mapping[str, Any]) -> None:
    forest = values.get("theme.forest", _BRAND_THEME["theme.forest"])
    gold = values.get("theme.gold", _BRAND_THEME["theme.gold"])
    _check_colour("forest", forest)
    _check_colour("gold", gold)
    if contrast_ratio("#F4F1DF", forest) < 4.5:
        raise ValidationFailed(
            "The forest colour does not provide enough contrast for light text.",
            {"forest": "contrast must be at least 4.5:1"},
        )
    if contrast_ratio("#1B1706", gold) < 4.5:
        raise ValidationFailed(
            "The gold colour does not provide enough contrast for dark text.",
            {"gold": "contrast must be at least 4.5:1"},
        )
    # The third protected pair is fixed by the design tokens and is checked as a regression guard.
    if contrast_ratio("#123524", "#F3F8F1") < 4.5:
        raise ValidationFailed("The fixed ink and background colours fail contrast validation.")


def _same_kind(expected: Any, value: Any) -> bool:
    if isinstance(expected, bool):
        return isinstance(value, bool)
    if isinstance(expected, int):
        return isinstance(value, int) and not isinstance(value, bool)
    if isinstance(expected, str):
        return isinstance(value, str)
    if isinstance(expected, list):
        return isinstance(value, list)
    if isinstance(expected, dict):
        return isinstance(value, dict)
    return True


def _localise(value: Any, lang: str) -> Any:
    if isinstance(value, dict):
        if value and all(isinstance(k, str) and isinstance(v, str) for k, v in value.items()):
            # Treat a dictionary as localized only when all keys look like language codes.
            if all(re.fullmatch(r"[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*", k) for k in value):
                return value.get(lang) or value.get("en") or next(iter(value.values()), "")
        return {key: _localise(item, lang) for key, item in value.items()}
    if isinstance(value, list):
        return [_localise(item, lang) for item in value]
    return value


async def admin_entries(
    principal: Principal,
    runtime: Settings | None = None,
    group: str | None = None,
) -> list[SettingEntry]:
    values = _values_with_defaults(await repo.get_values(), runtime)
    entries: list[SettingEntry] = []
    for key in sorted(values):
        current_group = setting_group(key)
        if group is not None and current_group != group:
            continue
        if current_group in {"sms", "system"} and not principal.has("system:manage"):
            continue
        if current_group not in {"sms", "system"} and not principal.has("settings:read"):
            continue
        entries.append(SettingEntry(key=key, group=current_group, value=values[key]))
    return entries


async def public_site(lang: str) -> PublicSiteSettings:
    values = _values_with_defaults(await repo.get_values())
    grouped: dict[str, dict[str, Any]] = {group: {} for group in _PUBLIC_GROUPS}
    for key, value in values.items():
        group, suffix = key.split(".", maxsplit=1)
        if group in grouped:
            grouped[group][suffix] = _localise(value, lang)
    # Keep the compact shape already consumed by Header, Footer and the contact actions.
    grouped["business"]["phone"] = grouped["business"].get("phone_display", "0787 499 988")
    grouped["business"]["office"] = grouped["business"].get("address", "Kampala, Uganda")
    return PublicSiteSettings(**grouped)


async def patch_group(
    principal: Principal,
    group: str,
    changes: dict[str, Any],
    ip_hash: str | None,
) -> list[SettingEntry]:
    if group not in _GROUPS:
        raise ValidationFailed("Unknown settings tab.", {"tab": "unknown"})
    if group in {"sms", "system"}:
        if not principal.has("system:manage"):
            raise Forbidden(f"{group.title()} settings require system:manage.")
        principal.authorised_by = tuple(dict.fromkeys((*principal.authorised_by, "system:manage")))
    persisted = await repo.get_values()
    values = _values_with_defaults(persisted)
    before: dict[str, Any] = {}
    after: dict[str, Any] = {}
    for suffix, value in changes.items():
        key = f"{group}.{suffix}"
        if key not in values:
            raise ValidationFailed("This setting cannot be changed.", {suffix: "unknown setting"})
        if key == "sms.provider":
            raise ValidationFailed(
                "The SMS provider is set in deployment configuration.", {suffix: "read only"}
            )
        if not _same_kind(values[key], value):
            raise ValidationFailed("The value has the wrong type.", {suffix: "invalid type"})
        if isinstance(value, str):
            value = value.strip()
        if key == "sms.sender_id" and len(value) > 11:
            raise ValidationFailed(
                "Sender ID must be 11 characters or fewer.", {suffix: "too long"}
            )
        if key == "sms.message_category" and value not in {"non_customised", "info", "customised"}:
            raise ValidationFailed(
                "Choose a supported message category.", {suffix: "invalid category"}
            )
        if key == "sms.daily_limit" and not 1 <= value <= 10000:
            raise ValidationFailed(
                "Daily SMS limit must be between 1 and 10000.", {suffix: "out of range"}
            )
        if key == "notify.reminder_minutes" and not 1 <= value <= 1440:
            raise ValidationFailed(
                "Reminder minutes must be between 1 and 1440.", {suffix: "out of range"}
            )
        if key == "business.whatsapp" and (not value.isdigit() or len(value) < 8):
            raise ValidationFailed(
                "WhatsApp must contain digits only, including the country code.",
                {suffix: "invalid number"},
            )
        if key == "business.phone_dial" and (not value.startswith("+") or not value[1:].isdigit()):
            raise ValidationFailed(
                "Use an international phone number beginning with +.", {suffix: "invalid number"}
            )
        if key == "system.PAYMENT_GATEWAY_MODE" and value not in {"sandbox", "production"}:
            raise ValidationFailed(
                "Payment gateway mode must be sandbox or production.",
                {suffix: "invalid mode"},
            )
        if key in {"system.MAX_DAILY_VISITS", "system.MAX_ITEMS_PER_USER"} and not 1 <= value <= 100000:
            raise ValidationFailed(
                "The operational limit must be between 1 and 100000.",
                {suffix: "out of range"},
            )
        if key == "system.SESSION_TIMEOUT_MINUTES" and not 5 <= value <= 1440:
            raise ValidationFailed(
                "Session timeout must be between 5 and 1440 minutes.",
                {suffix: "out of range"},
            )
        if key == "system.MAX_UPLOAD_SIZE_MB" and not 1 <= value <= 1024:
            raise ValidationFailed(
                "Maximum upload size must be between 1 and 1024 MB.",
                {suffix: "out of range"},
            )
        if key == "system.WEBHOOK_RETRY_ATTEMPTS" and not 0 <= value <= 20:
            raise ValidationFailed(
                "Webhook retries must be between 0 and 20.",
                {suffix: "out of range"},
            )
        if key == "system.API_REQUEST_TIMEOUT_SEC" and not 1 <= value <= 300:
            raise ValidationFailed(
                "API request timeout must be between 1 and 300 seconds.",
                {suffix: "out of range"},
            )
        if key == "system.SYNC_CRON_INTERVAL_MIN" and not 1 <= value <= 1440:
            raise ValidationFailed(
                "Sync interval must be between 1 and 1440 minutes.",
                {suffix: "out of range"},
            )
        if key == "system.DEFAULT_SENDER_EMAIL" and (
            "@" not in value or value.startswith("@") or value.endswith("@")
        ):
            raise ValidationFailed(
                "Enter a valid sender email address.",
                {suffix: "invalid email"},
            )
        if key == "system.SUPPORT_CONTACT_EMAIL" and (
            "@" not in value or value.startswith("@") or value.endswith("@")
        ):
            raise ValidationFailed(
                "Enter a valid support email address.",
                {suffix: "invalid email"},
            )
        if key == "system.DEFAULT_TIMEZONE" and "/" not in value:
            raise ValidationFailed(
                "Use an IANA timezone such as Africa/Kampala.",
                {suffix: "invalid timezone"},
            )
        if key in _EDITABLE_THEME_KEYS:
            _check_colour(suffix, value)
        before[key] = values[key]
        after[key] = value
    proposed = {**values, **after}
    if group == "theme":
        _check_theme(proposed)
    if group == "home":
        headline = proposed.get("home.headline", "")
        accent = proposed.get("home.accent", "")
        accent_is_valid = (
            isinstance(headline, str)
            and isinstance(accent, str)
            and bool(accent.strip())
            and accent.casefold() in headline.casefold()
        )
        if not accent_is_valid:
            raise ValidationFailed(
                "The homepage accent must appear in the headline.",
                {"accent": "must appear in the headline"},
            )
    for key, value in after.items():
        await repo.set_value(key, value)
    if after:
        await audit.record(
            principal,
            "settings.update",
            "settings",
            group,
            group,
            before=before,
            after=after,
            ip_hash=ip_hash,
        )
    return await admin_entries(principal, group=group)


async def reset_theme(principal: Principal, ip_hash: str | None) -> list[SettingEntry]:
    persisted = await repo.get_values()
    values = _values_with_defaults(persisted)
    before = {key: values.get(key) for key in _EDITABLE_THEME_KEYS}
    for key, value in _BRAND_THEME.items():
        await repo.set_value(key, value)
    await audit.record(
        principal,
        "settings.theme.reset",
        "settings",
        "theme",
        "theme",
        before=before,
        after=_BRAND_THEME,
        ip_hash=ip_hash,
    )
    return await admin_entries(principal)


async def seed_settings(runtime: Settings | None = None) -> int:
    """Insert documented defaults only where the owner has not already saved a value."""
    return await repo.seed_defaults(setting_defaults(runtime))
