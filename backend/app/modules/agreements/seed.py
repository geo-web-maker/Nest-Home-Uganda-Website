"""Idempotent agreement seeds.

The legal wording is sourced from the 14-page owner-supplied agreement PDF. Published
versions are immutable; this helper never edits an already-published version.
"""

from datetime import UTC, datetime

from app.modules.agreements import messages, rules
from app.modules.agreements.models import AgreementTemplate
from app.modules.agreements.source_blocks import SOURCE_BLOCKS
from app.modules.agreements.source_template import SOURCE_CLAUSES, SOURCE_FILE


async def seed_message_defaults() -> int:
    """Return the number of shipped default messages; defaults are code-backed."""
    return len(messages.DEFAULTS)


async def seed_source_template() -> int:
    """Seed the exact PDF wording once without replacing an owner's published version.

    When there is no published template, the source is published as v1. If a different
    version is already live, the PDF is saved as an unpublished draft for an authorized
    owner to compare and publish. An existing deployment must never fail to start merely
    because a new source document has arrived.
    """
    rules.validate_template_sections(SOURCE_CLAUSES)
    expected_hash = rules.template_hash(SOURCE_CLAUSES, SOURCE_BLOCKS)

    existing = await AgreementTemplate.find_one(AgreementTemplate.template_hash == expected_hash)
    if existing is not None:
        return 0

    active = await AgreementTemplate.find_one(
        AgreementTemplate.is_published == True,  # noqa: E712
        sort=[("version", -1)],
    )
    rows = await AgreementTemplate.find().sort("-version").limit(1).to_list()
    version = (rows[0].version + 1) if rows else 1
    draft = await AgreementTemplate.find_one(AgreementTemplate.version == version)
    if draft is None:
        draft = AgreementTemplate(
            version=version,
            clauses=dict(SOURCE_CLAUSES),
            blocks=list(SOURCE_BLOCKS),
            template_hash=expected_hash,
            source_file=SOURCE_FILE,
            is_published=active is None,
            published_at=datetime.now(UTC) if active is None else None,
            published_by=None,
        )
        await draft.insert()
    else:
        # Only an unpublished draft may be populated by the bootstrap.
        if draft.is_published:
            raise RuntimeError("Refusing to modify an already-published agreement template.")
        draft.clauses = dict(SOURCE_CLAUSES)
        draft.blocks = list(SOURCE_BLOCKS)
        draft.template_hash = expected_hash
        draft.source_file = SOURCE_FILE
        draft.is_published = active is None
        draft.published_at = datetime.now(UTC) if active is None else None
        await draft.save()
    return 1
