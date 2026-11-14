"""Sandbox for the test accounts: who they are, whether the current request is theirs, and what they may reach.

`get_principal` calls `bind` for every authenticated request. While `active()` is true, code that
would contact real people (SMS, push, system email) skips the send, unless the recipient is on the
superadmin's delivery allowlist (see `allowed_emails` / `allowed_phone`).
"""

import time
from contextvars import ContextVar

_active: ContextVar[bool] = ContextVar("test_sandbox_active", default=False)
# Ids of the test accounts, set only for a request made by a real (non-test) signed-in user.
_hidden: ContextVar[tuple] = ContextVar("test_sandbox_hidden", default=())
_cache: dict = {"at": 0.0, "ids": frozenset(), "emails": frozenset(),
                "enabled": False, "delivery": "sink", "allow_emails": frozenset(), "allow_phones": frozenset()}
_TTL_SECONDS = 20


async def _load() -> None:
    if time.monotonic() - _cache["at"] < _TTL_SECONDS:
        return
    from app.modules.auth.models import User
    from app.modules.test_accounts.models import TestSandboxConfig

    try:
        users = await User.find({"is_test": True}).to_list()
        cfg = await TestSandboxConfig.find_one(TestSandboxConfig.key == "main")
    except Exception:  # never block a request because the lookup failed; the flag is only a safety net
        return
    _cache.update(
        at=time.monotonic(), ids=frozenset(str(u.id) for u in users),
        emails=frozenset(u.email.lower() for u in users),
        enabled=bool(cfg and cfg.enabled),
        delivery=cfg.delivery if cfg and cfg.delivery in ("sink", "allowlist") else "sink",
        allow_emails=frozenset(e.lower() for e in (cfg.emails if cfg else [])),
        allow_phones=frozenset(cfg.phones if cfg else []),
    )


def forget() -> None:
    """Call after changing which accounts are test accounts, or the sandbox settings."""
    _cache["at"] = 0.0


async def bind(user_id: str) -> None:
    await _load()
    is_test = user_id in _cache["ids"]
    _active.set(is_test)
    # Real staff never see what the test accounts created. A test account sees everything its reach allows.
    _hidden.set(() if is_test else tuple(sorted(_cache["ids"])))


def reveal() -> None:
    """Show test data for the rest of this request. Used by the test-account screens and the purge."""
    _hidden.set(())


def active() -> bool:
    return _active.get()


async def master_enabled() -> bool:
    """The master switch. Off means the test accounts cannot be used at all."""
    await _load()
    return bool(_cache["enabled"])


async def is_test_user(user_id: str) -> bool:
    await _load()
    return user_id in _cache["ids"]


async def without_test_addresses(addresses):
    """Drop test-account addresses from a real send. Accepts a string or a list; returns the same kind."""
    await _load()
    if isinstance(addresses, str):
        return "" if addresses.lower() in _cache["emails"] else addresses
    return [a for a in addresses if str(a).lower() not in _cache["emails"]]


async def allowed_emails(addresses) -> list[str]:
    """For a send made by a test account: the recipients that may really receive it.

    Empty unless delivery is "allowlist" and the address is on the superadmin's list. A test
    account's own address is never allowed, so mail cannot be used to reach them from outside.
    """
    await _load()
    if _cache["delivery"] != "allowlist":
        return []
    items = [addresses] if isinstance(addresses, str) else list(addresses)
    return [a for a in items
            if str(a).lower() in _cache["allow_emails"] and str(a).lower() not in _cache["emails"]]


async def allowed_phone(number: str) -> bool:
    await _load()
    return _cache["delivery"] == "allowlist" and number in _cache["allow_phones"]


def _hidden_expression(field: str):
    ids = _hidden.get()
    return {field: {"$nin": list(ids)}} if ids else None


def hide_test_data(field: str):
    """Class decorator for a Beanie document: queries made for a real user skip rows the test accounts own.

    `field` is the document field holding the owner's user id (nurse_id, user_id or created_by). Queries
    made with no signed-in user (background jobs, the test-account screens after `reveal()`) see everything.
    """
    def wrap(cls):
        for name in ("find", "find_many", "find_one"):
            original = getattr(cls, name).__func__

            def make(orig):
                def method(klass, *args, **kwargs):
                    extra = _hidden_expression(field)
                    return orig(klass, *args, *((extra,) if extra else ()), **kwargs)
                return method

            setattr(cls, name, classmethod(make(original)))
        return cls
    return wrap
