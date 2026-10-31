"""Validated mail settings with database > environment > built-in precedence."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import time
from base64 import urlsafe_b64encode
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings
from app.core.errors import ValidationFailed
from app.modules.mail import db
from app.modules.mail.defaults import BY_KEY, DEFINITIONS, SettingDefinition

_CACHE_SECONDS = 30
_cache: dict[str, tuple[float, Any]] = {}
_DOMAIN_RE = re.compile(
    r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)"
    r"(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$",
    re.I,
)


def clear_cache() -> None:
    _cache.clear()


def _fernet() -> Fernet:
    secret = get_settings().nest_mail_secret_key
    if not secret:
        raise ValidationFailed(
            "NEST_MAIL_SECRET_KEY must be configured before saving mail secrets.",
            {"NEST_MAIL_SECRET_KEY": "required"},
        )
    key = urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def encrypt_secret(value: str) -> str:
    return "enc:" + _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_secret(value: str) -> str:
    if not value.startswith("enc:"):
        # Older/manual rows must never be treated as plaintext secrets.
        raise ValidationFailed("Stored mail secret is not encrypted. Replace it in settings.")
    try:
        return _fernet().decrypt(value[4:].encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise ValidationFailed(
            "Mail secret cannot be decrypted. Check NEST_MAIL_SECRET_KEY or restore its backup."
        ) from exc


def _environment_names(definition: SettingDefinition) -> tuple[str, ...]:
    generic = "NEST_MAIL_" + definition.key.removeprefix("mail.").replace(".", "_").upper()
    aliases = {
        "mail.provider_api_key": ("NEST_MAIL_API_KEY", generic),
    }
    return aliases.get(definition.key, (generic,))


def _parse_environment(raw: str, definition: SettingDefinition) -> Any:
    if definition.kind == "boolean":
        lowered = raw.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off"}:
            return False
        raise ValidationFailed(f"Environment value for {definition.key} must be a boolean.")
    if definition.kind == "integer":
        return int(raw)
    if definition.kind == "number":
        return float(raw)
    if definition.kind == "list":
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass
        return [part.strip() for part in raw.split(",") if part.strip()]
    return raw


def _validate(definition: SettingDefinition, value: Any) -> Any:
    if definition.secret:
        if not isinstance(value, str) or not value.strip():
            raise ValidationFailed("Enter a non-empty secret value.", {definition.key: "required"})
        return value.strip()
    if definition.kind == "boolean":
        valid = isinstance(value, bool)
    elif definition.kind == "integer":
        valid = isinstance(value, int) and not isinstance(value, bool)
    elif definition.kind == "number":
        valid = isinstance(value, int | float) and not isinstance(value, bool)
    elif definition.kind == "list":
        valid = isinstance(value, list) and all(isinstance(item, str) for item in value)
    elif definition.kind == "choice":
        valid = isinstance(value, str) and value in definition.choices
    elif definition.kind == "string":
        valid = isinstance(value, str)
    else:
        valid = False
    if not valid:
        raise ValidationFailed(
            f"Invalid value for {definition.key}.",
            {definition.key: "invalid_type_or_value"},
        )
    if definition.kind == "number" and not math.isfinite(value):
        raise ValidationFailed(
            f"{definition.key} must be a finite number.",
            {definition.key: "not_finite"},
        )
    if definition.key == "mail.domain":
        value = value.strip().lower()
    if definition.key == "mail.accepted_domains":
        value = [domain.strip().lower() for domain in value]
    if definition.minimum is not None and value < definition.minimum:
        raise ValidationFailed(
            f"{definition.key} is below its minimum.", {definition.key: "too_small"}
        )
    if definition.maximum is not None and value > definition.maximum:
        raise ValidationFailed(
            f"{definition.key} is above its maximum.", {definition.key: "too_large"}
        )
    if definition.key in {"mail.from_name", "mail.reply_to"} and any(
        character in value for character in "\r\n"
    ):
        raise ValidationFailed(
            f"{definition.key} cannot contain line breaks.",
            {definition.key: "invalid_header_value"},
        )
    if definition.key == "mail.domain" and value and not _DOMAIN_RE.fullmatch(value):
        raise ValidationFailed(
            "Enter a valid root mail domain.", {definition.key: "invalid_domain"}
        )
    if definition.key == "mail.accepted_domains":
        for domain in value:
            if not _DOMAIN_RE.fullmatch(domain):
                raise ValidationFailed(
                    "Accepted domains must contain valid domain names.",
                    {definition.key: "invalid_domain"},
                )
    if definition.key == "mail.address_pattern":
        if not value or not any(token in value for token in ("{first}", "{last}", "{staff_no}")):
            raise ValidationFailed(
                "Address pattern must include at least one supported token.",
                {definition.key: "invalid_pattern"},
            )
        if re.search(r"[^a-zA-Z0-9{}._-]", value):
            raise ValidationFailed(
                "Address pattern contains unsupported characters.",
                {definition.key: "invalid_pattern"},
            )
        unknown = set(re.findall(r"\{([^{}]+)\}", value)) - {"first", "last", "staff_no"}
        if unknown:
            raise ValidationFailed(
                "Address pattern contains an unknown token.",
                {definition.key: "unknown_token"},
            )
    if definition.key == "mail.max_message_mb" and value > 25:
        raise ValidationFailed("Maximum message size cannot exceed Cloudflare's 25 MB limit.")
    return value


async def get_value(key: str, *, pool: Any | None = None, use_cache: bool = True) -> Any:
    definition = BY_KEY.get(key)
    if definition is None:
        raise ValidationFailed("Unknown mail setting.", {"key": "unknown"})
    now = time.monotonic()
    cached = _cache.get(key)
    if use_cache and cached and cached[0] > now:
        return cached[1]

    active_pool = pool or db.get_pool()
    row = await active_pool.fetchrow(
        "SELECT value, is_secret FROM mail_settings WHERE key = $1", key
    )
    if row is not None:
        raw_value = row["value"]
        if isinstance(raw_value, str):
            try:
                raw_value = json.loads(raw_value)
            except json.JSONDecodeError as exc:
                raise ValidationFailed(
                    "Stored mail setting is invalid. Reset it in settings."
                ) from exc
        if definition.secret:
            if (
                not row["is_secret"]
                or not isinstance(raw_value, dict)
                or "encrypted" not in raw_value
            ):
                raise ValidationFailed("Stored mail secret is invalid. Replace it in settings.")
            result = decrypt_secret(str(raw_value["encrypted"]))
        else:
            result = raw_value
    else:
        result = None
        for env_name in _environment_names(definition):
            raw = os.getenv(env_name)
            if raw is not None and raw != "":
                try:
                    result = _parse_environment(raw, definition)
                    if not definition.secret:
                        result = _validate(definition, result)
                except (ValueError, TypeError) as exc:
                    raise ValidationFailed(f"Invalid environment value for {env_name}.") from exc
                break
        if result is None:
            # The legacy bootstrap fields are only a fallback source; never expose them.
            config = get_settings()
            if key == "mail.domain" and config.nest_mail_domain:
                result = config.nest_mail_domain
            elif key == "mail.provider" and config.nest_mail_provider:
                result = config.nest_mail_provider
            elif key == "mail.provider_api_key" and config.nest_mail_api_key:
                result = config.nest_mail_api_key
            else:
                result = definition.default
    _cache[key] = (now + _CACHE_SECONDS, result)
    return result


async def set_values(
    values: dict[str, Any], actor_user_id: str, *, pool: Any | None = None
) -> None:
    """Persist a validated batch atomically, with one audit row per changed key."""
    active_pool = pool or db.get_pool()
    values = dict(values)
    if "mail.domain" in values:
        old_domain = str(await get_value("mail.domain", pool=active_pool, use_cache=False) or "").strip().lower()
        new_domain = str(values["mail.domain"] or "").strip().lower()
        if old_domain and new_domain and old_domain != new_domain:
            accepted = await get_value("mail.accepted_domains", pool=active_pool, use_cache=False)
            values["mail.accepted_domains"] = sorted({str(x).lower() for x in (accepted or [])} | {old_domain})
    encoded: list[tuple[str, str, bool]] = []
    for key, value in values.items():
        definition = BY_KEY.get(key)
        if definition is None:
            raise ValidationFailed("Unknown mail setting.", {key: "unknown"})
        validated = _validate(definition, value)
        stored: Any = {"encrypted": encrypt_secret(validated)} if definition.secret else validated
        encoded.append((key, json.dumps(stored), definition.secret))

    async with active_pool.acquire() as connection:
        async with connection.transaction():
            for key, stored_json, is_secret in encoded:
                await connection.execute(
                    """INSERT INTO mail_settings (key, value, is_secret, updated_by, updated_at)
                       VALUES ($1, $2::jsonb, $3, $4, now())
                       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value,
                         is_secret = EXCLUDED.is_secret, updated_by = EXCLUDED.updated_by,
                         updated_at = now()""",
                    key,
                    stored_json,
                    is_secret,
                    actor_user_id,
                )
                await connection.execute(
                    """INSERT INTO mail_audit (actor_user_id, action, detail)
                       VALUES ($1, 'mail.settings.change', $2::jsonb)""",
                    actor_user_id,
                    json.dumps({"key": key, "changed": True}),
                )
    clear_cache()


async def set_value(
    key: str, value: Any, actor_user_id: str, *, pool: Any | None = None
) -> None:
    await set_values({key: value}, actor_user_id, pool=pool)


async def reset_value(key: str, actor_user_id: str, *, pool: Any | None = None) -> None:
    definition = BY_KEY.get(key)
    if definition is None:
        raise ValidationFailed("Unknown mail setting.", {"key": "unknown"})
    active_pool = pool or db.get_pool()
    async with active_pool.acquire() as connection:
        async with connection.transaction():
            await connection.execute("DELETE FROM mail_settings WHERE key = $1", key)
            await connection.execute(
                """INSERT INTO mail_audit (actor_user_id, action, detail)
                   VALUES ($1, 'mail.settings.change', $2::jsonb)""",
                actor_user_id,
                json.dumps({"key": key, "reset": True}),
            )
    clear_cache()


async def settings_for_api(*, pool: Any | None = None) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for definition in DEFINITIONS:
        value = await get_value(definition.key, pool=pool)
        item: dict[str, Any] = {
            "key": definition.key,
            "group": definition.group,
            "label": definition.label,
            "help": definition.help,
            "type": definition.kind,
            "default": definition.default,
            "is_secret": definition.secret,
        }
        if definition.secret:
            item["is_set"] = bool(value)
        else:
            item["value"] = value
        if definition.choices:
            item["choices"] = list(definition.choices)
        if definition.minimum is not None:
            item["minimum"] = definition.minimum
        if definition.maximum is not None:
            item["maximum"] = definition.maximum
        items.append(item)
    return items
