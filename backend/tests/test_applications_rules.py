"""CV type detection and the other pure rules for applications. No database."""

import io
import zipfile
from datetime import UTC, datetime

import pytest

from app.modules.applications import rules


def docx_bytes(part: str = "word/document.xml") -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(part, "<w:document/>")
    return buffer.getvalue()


PDF = b"%PDF-1.7\n" + b"0" * 32
DOC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 32


@pytest.mark.parametrize(
    ("data", "name", "expected"),
    [
        (PDF, "cv.pdf", ("application/pdf", "pdf")),
        (PDF, "CV.PDF", ("application/pdf", "pdf")),
        (DOC, "cv.doc", ("application/msword", "doc")),
        (docx_bytes(), "cv.docx", (rules._MIME["docx"], "docx")),
        (PDF, "cv.docx", None),  # the extension has to agree with the bytes
        (docx_bytes(), "cv.pdf", None),
        (docx_bytes("xl/workbook.xml"), "cv.docx", None),  # a zip that is not a Word file
        (b"PK\x03\x04 not really a zip", "cv.docx", None),
        (b"MZ\x90\x00", "cv.pdf", None),
        (b"<html><script>alert(1)</script></html>", "cv.pdf", None),
        (b"", "cv.pdf", None),
        (PDF, "cv", None),
    ],
)
def test_type_comes_from_the_bytes(
    data: bytes, name: str, expected: tuple[str, str] | None
) -> None:
    assert rules.detect_cv_type(data, name) == expected


def test_file_names_are_reduced_to_a_safe_display_name() -> None:
    assert rules.safe_file_name("../../etc/passwd") == "passwd"
    assert rules.safe_file_name("C:\\Users\\mary\\My CV.pdf") == "My CV.pdf"
    assert rules.safe_file_name("cv\x00<script>.pdf") == "cv_script_.pdf"
    assert rules.safe_file_name("") == "cv"
    assert len(rules.safe_file_name("a" * 300 + ".pdf")) == 100


def test_clean_strips_control_characters_and_spaces() -> None:
    assert rules.clean("  Mary\x00 Atim\x07 ") == "Mary Atim"


def test_links_are_detected() -> None:
    assert rules.has_link("visit www.spam.com")
    assert rules.has_link("http://x")
    assert not rules.has_link("Mary Atim")


def test_applicant_data_is_kept_for_twelve_months() -> None:
    applied = datetime(2026, 10, 20, tzinfo=UTC)
    assert rules.delete_after(applied) == datetime(2027, 10, 20, tzinfo=UTC)
    assert rules.CV_MAX_BYTES == 5 * 1024 * 1024
    assert rules.CV_LINK_SECONDS == 600
