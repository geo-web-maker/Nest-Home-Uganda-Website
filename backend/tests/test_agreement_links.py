"""Stable agreement links: format, typo detection and exact failure reasons (no database)."""
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.modules.agreements import links

SECRET = b"s" * 32


class _Field:
    def __init__(self, name):
        self.name = name

    def __eq__(self, other):  # builds a query the fake model understands
        return (self.name, other)

    __hash__ = object.__hash__


class FakeAgreement:
    token_hash = _Field("token_hash")
    view_token_hash = _Field("view_token_hash")
    rows: list = []

    class _Q:
        def __init__(self, rows):
            self.rows = rows

        async def to_list(self):
            return self.rows

    @classmethod
    def find(cls, cond):
        return cls._Q([r for r in cls.rows if r.status in cond["status"]["$in"]])

    @classmethod
    async def find_one(cls, cond):
        if isinstance(cond, dict):
            digest = cond["link_history.hash"]
            return next((r for r in cls.rows if any(t.hash == digest for t in r.link_history)), None)
        name, value = cond
        return next((r for r in cls.rows if getattr(r, name) == value), None)


def doc(**kw):
    base = dict(id="A", link_generation=0, token_hash=None, view_token_hash=None, link_history=[], status="sent",
                token_expires_at=datetime.now(UTC) + timedelta(days=5))
    base.update(kw)
    return SimpleNamespace(**base)


def tomb(code, reason, purpose="sign"):
    return SimpleNamespace(hash=links.link_hash(code), reason=reason, purpose=purpose)


async def state_of(raw):
    try:
        await links.resolve(raw, FakeAgreement)
    except links.LinkError as exc:
        return exc.state
    return "ok"


def test_derive_is_stable_and_formatted():
    a = links.derive(SECRET, "abc", 0)
    assert a == links.derive(SECRET, "abc", 0)
    assert a != links.derive(SECRET, "abc", 1)
    assert a != links.derive(SECRET, "abc", 0, "view")
    assert len(a) == 16 and len(links.display(a)) == 19


def test_parse_ignores_case_hyphens_spaces_and_lookalikes():
    code = links.derive(SECRET, "abc", 0)
    shown = links.display(code)
    assert links.parse(shown).canonical == code
    assert links.parse(shown.lower()).canonical == code
    assert links.parse(f"  {shown}. ").canonical == code
    assert links.parse(shown.replace("0", "O")).canonical == code


def test_parse_detects_truncation_and_typos_without_a_database():
    code = links.derive(SECRET, "abc", 0)
    assert links.parse(code[:11]).kind == "mistyped"
    swapped = ("1" if code[3] == "2" else "2").join([code[:3], code[4:]])
    assert links.parse(swapped).kind == "mistyped"
    assert links.parse("unsubscribe-unsubscribe").kind == "malformed"
    assert links.parse("").kind == "malformed"


def test_legacy_long_token_is_still_accepted_as_issued():
    legacy = "CUuidr2ZlULNhuWkvv34uREizVoQ3y89HnsXNdb6UdA"
    assert links.parse(legacy).kind == "legacy" and links.parse(legacy).canonical == legacy


@pytest.mark.asyncio
async def test_each_failure_has_its_own_reason_and_ref():
    live = links.derive(SECRET, "A", 0)
    old = links.derive(SECRET, "A", 1)
    gone = links.derive(SECRET, "B", 0)
    FakeAgreement.rows = [
        doc(token_hash=links.link_hash(live), link_history=[tomb(old, "superseded"), tomb(gone, "expired")]),
    ]
    assert await state_of(live) == "ok"
    assert await state_of(old) == "ok"                 # earlier link of an open agreement still works
    assert await state_of(gone) == "expired"
    assert await state_of(links.derive(SECRET, "Z", 0)) == "not_found"
    assert await state_of(live[:9]) == "mistyped"
    assert await state_of("hello") == "malformed"
    FakeAgreement.rows[0].link_history[0].reason = "revoked"
    assert await state_of(old) == "revoked"


@pytest.mark.asyncio
async def test_agreement_status_decides_the_message():
    code = links.derive(SECRET, "A", 0)
    for status, expected in [("completed", "signed"), ("client_signed", "signed"), ("voided", "revoked"),
                             ("expired", "expired"), ("changes_requested", "closed"), ("draft", "closed")]:
        FakeAgreement.rows = [doc(token_hash=links.link_hash(code), status=status)]
        assert await state_of(code) == expected
    FakeAgreement.rows = [doc(token_hash=links.link_hash(code), token_expires_at=datetime.now(UTC) - timedelta(seconds=1))]
    assert await state_of(code) == "expired"


@pytest.mark.asyncio
async def test_error_carries_support_ref_and_no_store():
    code = links.derive(SECRET, "A", 0)
    FakeAgreement.rows = []
    with pytest.raises(links.LinkError) as info:
        await links.resolve(code, FakeAgreement, "abc1234")
    err = info.value
    assert err.code == "link_not_found" and err.status_code == 404
    assert err.fields["ref"] == f"L3-{links.link_id(code)}" and err.fields["release"] == "abc1234"
    assert err.headers["Cache-Control"] == "no-store"


def test_paste_damage_is_cleaned():
    code = links.derive(SECRET, "A", 0)
    shown = links.display(code)
    for pasted in [f"https://bhcug.com/a/{shown}", f"https://bhcug.com/a/{shown.replace('-', '%20-')}",
                   shown[:9] + " \n " + shown[9:], "\u200b" + shown, f"<{shown}>"]:
        assert links.parse(pasted).canonical == code


@pytest.mark.asyncio
async def test_one_wrong_or_missing_character_still_connects_to_the_only_match():
    code = links.derive(SECRET, "A", 0)
    FakeAgreement.rows = [doc(token_hash=links.link_hash(code))]
    wrong = ("2" if code[4] != "2" else "3").join([code[:4], code[5:]])
    for bad in [wrong, code[:7] + code[8:], code + "7"]:
        res = await links.resolve(bad, FakeAgreement, "r", SECRET)
        assert res.corrected and res.canonical == code
    with pytest.raises(links.LinkError):  # two characters wrong is not repaired
        await links.resolve(wrong[:9] + "000", FakeAgreement, "r", SECRET)
