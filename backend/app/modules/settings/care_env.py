"""Environment overrides for care settings with strict type parsing."""

import base64
import os
from typing import Any

from app.modules.settings.care_keys import CARE_SETTINGS, validate_value


def env_name(key: str) -> str:
    stripped = key.removeprefix("care.")
    return "CARE_" + stripped.replace(".", "_").upper()


def _parse(spec, raw: str, name: str) -> Any:
    try:
        if spec.type == "boolean":
            if raw.lower() not in {"true", "false"}:
                raise ValueError("expected true or false")
            value = raw.lower() == "true"
        elif spec.type == "integer":
            value = int(raw)
        elif spec.type == "list":
            value = [part.strip() for part in raw.split(",") if part.strip()]
        elif spec.type == "map":
            value = {}
            for entry in raw.split(";"):
                if not entry.strip():
                    continue
                if "=" not in entry:
                    raise ValueError("expected Label=value;Label=value")
                key, val = entry.split("=", 1)
                value[key.strip()] = val.strip()
        elif spec.type in {"text", "choice", "time"}:
            value = raw
        else:
            raise ValueError("unsupported setting type")
        return validate_value(spec.id, value)
    except (ValueError, TypeError) as exc:
        raise ValueError(f"{name}: invalid value for {spec.type}: {exc}") from exc


def env_value(key: str, environ=None):
    environ = os.environ if environ is None else environ
    spec = CARE_SETTINGS[key]
    name = env_name(key)
    raw = environ.get(name, "")
    if raw != "":
        return _parse(spec, raw, name)
    if spec.type == "text":
        encoded = environ.get(name + "_B64", "")
        if encoded:
            try:
                return base64.b64decode(encoded, validate=True).decode("utf-8")
            except Exception as exc:
                raise ValueError(f"{name}_B64: expected base64-encoded UTF-8 text") from exc
    return None


def validate_care_environment(environ=None):
    names = [env_name(key) for key in CARE_SETTINGS]
    if len(names) != len(set(names)):
        raise RuntimeError("Care setting environment names collide")
    for key in CARE_SETTINGS:
        env_value(key, environ)


def defaults_with_environment(environ=None):
    return {
        key: (env_value(key, environ) if env_value(key, environ) is not None else spec.default)
        for key, spec in CARE_SETTINGS.items()
    }
