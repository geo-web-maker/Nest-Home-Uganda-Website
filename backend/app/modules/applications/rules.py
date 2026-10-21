"""Pure rules for applications: text cleaning, CV type detection, retention. No I/O."""

import io
import re
import zipfile
from datetime import datetime, timedelta

CV_MAX_BYTES = 5 * 1024 * 1024  # spec 6.3 and 9.6
CV_LINK_SECONDS = 600  # spec 7.5: "10-minute signed link"
RETENTION_DAYS = 365  # spec 6.3: "kept for 12 months"
GENERAL_INTEREST = "General interest"

_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_LINK = re.compile(
    r"(?i)(https?:|www\.|://|\b[\w-]+\.(?:com|net|org|info|biz|xyz|ru|cn|io|co|ug)\b)"
)
_OLE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
_MIME = {
    "pdf": "application/pdf",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def clean(value: str) -> str:
    return _CONTROL.sub("", value).strip()


def has_link(value: str) -> bool:
    return _LINK.search(value) is not None


def _extension(filename: str) -> str:
    name = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


def detect_cv_type(data: bytes, filename: str) -> tuple[str, str] | None:
    """Return (mime, extension) when the bytes are a PDF, DOC or DOCX and the file name agrees.

    The client's content type is never used. The signature decides the type, and the extension
    has to match it, so a renamed file is refused.
    """
    ext = _extension(filename)
    if data.startswith(b"%PDF-"):
        kind = "pdf"
    elif data.startswith(_OLE):
        kind = "doc"
    elif data.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                is_word = "word/document.xml" in archive.namelist()
        except (zipfile.BadZipFile, ValueError, OSError):
            return None
        if not is_word:
            return None
        kind = "docx"
    else:
        return None
    if ext != kind:
        return None
    return _MIME[kind], kind


def safe_file_name(filename: str) -> str:
    """A display-only name: no path, no odd characters, at most 100 characters."""
    base = filename.replace("\\", "/").rsplit("/", 1)[-1]
    base = re.sub(r"[^\w .\-()]", "_", _CONTROL.sub("", base), flags=re.UNICODE).strip(" .")
    return base[:100] or "cv"


def delete_after(applied_at: datetime) -> datetime:
    return applied_at + timedelta(days=RETENTION_DAYS)
