from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core import security
from app.core.config import get_settings
from app.core.i18n import pick_language, resolve
from app.core.rate_limit import InMemoryRateLimiter


def test_password_hash_is_argon2id_and_verifies() -> None:
    hashed = security.hash_password("correct horse battery")
    assert hashed.startswith("$argon2id$")
    assert security.verify_password("correct horse battery", hashed)
    assert not security.verify_password("wrong", hashed)
    assert not security.verify_password("x", "not-a-hash")


def test_access_token_round_trip() -> None:
    token, expires_in = security.create_access_token("u1", ["content:read"], False)
    claims = security.decode_access_token(token)
    assert claims.user_id == "u1"
    assert claims.scopes == {"content:read"}
    assert claims.is_superadmin is False
    assert expires_in == get_settings().access_token_minutes * 60


def test_expired_token_is_rejected() -> None:
    past = datetime.now(UTC) - timedelta(hours=1)
    token, _ = security.create_access_token("u1", [], False, now=past)
    with pytest.raises(security.TokenError):
        security.decode_access_token(token)


def test_tampered_and_foreign_tokens_are_rejected() -> None:
    token, _ = security.create_access_token("u1", [], False)
    with pytest.raises(security.TokenError):
        security.decode_access_token(token[:-2] + "xx")
    foreign = jwt.encode({"sub": "u1", "exp": 9999999999, "iat": 1}, "other-key" * 5, "HS256")
    with pytest.raises(security.TokenError):
        security.decode_access_token(foreign)
    wrong_type = jwt.encode(
        {"sub": "u1", "typ": "refresh", "scopes": [], "exp": 9999999999, "iat": 1},
        get_settings().secret_key,
        "HS256",
    )
    with pytest.raises(security.TokenError):
        security.decode_access_token(wrong_type)


def test_unsigned_none_algorithm_is_rejected() -> None:
    forged = jwt.encode({"sub": "u1", "typ": "access", "scopes": ["system:manage"]}, None, "none")
    with pytest.raises(security.TokenError):
        security.decode_access_token(forged)


def test_short_secret_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SECRET_KEY", "short")
    get_settings.cache_clear()
    try:
        with pytest.raises(RuntimeError):
            security.create_access_token("u1", [], False)
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()


def test_ip_hash_is_stable_and_not_the_ip() -> None:
    assert security.hash_ip("1.2.3.4") == security.hash_ip("1.2.3.4")
    assert security.hash_ip("1.2.3.4") != security.hash_ip("1.2.3.5")
    assert "1.2.3.4" not in security.hash_ip("1.2.3.4")


def test_opaque_tokens_are_unique_and_hash_is_one_way() -> None:
    a, b = security.new_opaque_token(), security.new_opaque_token()
    assert a != b and len(a) >= 40
    assert security.hash_token(a) != a and len(security.hash_token(a)) == 64


def test_rate_limiter_window_and_independent_keys() -> None:
    now = [100.0]
    limiter = InMemoryRateLimiter(clock=lambda: now[0])
    assert limiter.hit("k", 2, 60) is None
    assert limiter.hit("k", 2, 60) is None
    retry = limiter.hit("k", 2, 60)
    assert retry is not None and 1 <= retry <= 61
    assert limiter.hit("other", 2, 60) is None
    now[0] += 61
    assert limiter.hit("k", 2, 60) is None


def test_resolve_falls_back_to_english_per_field() -> None:
    text = {"en": "Hello", "lg": "Gyebale"}
    assert resolve(text, "lg") == "Gyebale"
    assert resolve(text, "sw") == "Hello"
    assert resolve({"lg": "only"}, "sw") == ""
    assert resolve(None, "en") == ""


def test_pick_language_order() -> None:
    assert pick_language("lg", "fr") == "lg"
    assert pick_language(None, "fr-FR,en;q=0.8") == "fr"
    assert pick_language("not a lang!", None) == "en"
    assert pick_language(None, None) == "en"
