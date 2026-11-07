"""Drafts created before a registry field existed get that field back, so the editor and the send check agree."""
import asyncio
from types import SimpleNamespace

from app.modules.agreements import rules, service


class _Doc(SimpleNamespace):
    saved = 0

    async def save(self) -> None:
        self.saved += 1


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def test_draft_gets_missing_registry_fields_back() -> None:
    fields = rules.initial_fields()
    dropped = rules.field_key("schedule_a.allergies")
    del fields[dropped]
    doc = _Doc(status="draft", fields=fields)
    _run(service._backfill_registry_fields(doc))
    assert dropped in doc.fields and doc.fields[dropped].value is None
    assert doc.fields[dropped].owner == rules.FIELD_OWNERS["schedule_a.allergies"]
    assert doc.saved == 1


def test_sent_agreement_fields_are_left_alone() -> None:
    fields = rules.initial_fields()
    del fields[rules.field_key("schedule_a.allergies")]
    doc = _Doc(status="sent", fields=fields)
    _run(service._backfill_registry_fields(doc))
    assert rules.field_key("schedule_a.allergies") not in doc.fields
    assert doc.saved == 0
