"""Idempotent mail maintenance note tests. Written, not run here."""

from app.modules.mail.maintenance import _merge_notes


def test_reprocess_notes_replace_diagnostics_instead_of_accumulating_counts():
    previous = {"removed_tags": {"script": 2}, "blocked_remote_images": 1, "signed": True}
    current = {"removed_tags": {"script": 2}, "blocked_remote_images": 1}

    merged = _merge_notes(previous, current)

    assert merged["removed_tags"] == {"script": 2}
    assert merged["blocked_remote_images"] == 1
    assert merged["signed"] is True
