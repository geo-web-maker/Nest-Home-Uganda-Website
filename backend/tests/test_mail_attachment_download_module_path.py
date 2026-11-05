"""Mounted import-path regression guard. Written, not run here."""

import inspect

from app.modules.mail import router


def test_attachment_download_has_no_dynamic_source_package_import():
    source = inspect.getsource(router.attachment_download)
    assert "__import__" not in source
    assert "app.modules" not in source
