"""Written, not run here. Sidecar boundary tests; all storage/clamd calls are faked."""
import hashlib
import os
import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("SCAN_BEARER_TOKEN", "test-token")
from app import app as scanner_app

client = TestClient(scanner_app)


def test_health_is_available_when_clamd_is_reachable(monkeypatch):
    import app as module
    monkeypatch.setattr(module.socket, "create_connection", lambda *a, **k: __import__("contextlib").nullcontext())
    assert client.get("/health").status_code == 200


def test_scan_requires_bearer():
    assert client.post("/scan", json={"key": "mail/attachments/a", "sha256": "a" * 64}).status_code == 401


def test_rejects_key_outside_attachment_prefix():
    r = client.post("/scan", headers={"Authorization": "Bearer test-token"},
                    json={"key": "mail/inbound/a", "sha256": "a" * 64})
    assert r.status_code == 400


def test_sha_mismatch_is_error(monkeypatch):
    import app as module
    class Body:
        def read(self, n): return b"sample" if not getattr(self, "done", False) else b""
    # Simpler deterministic body implementation.
    class Stream:
        sent = False
        def read(self, n):
            if self.sent: return b""
            self.sent = True
            return b"sample"
    monkeypatch.setattr(module, "_s3", lambda: type("S3", (), {
        "get_object": lambda self, **kw: {"ContentLength": 6, "Body": Stream()}
    })())
    monkeypatch.setenv("NEST_S3_BUCKET_MAIL", "bucket")
    r = client.post("/scan", headers={"Authorization": "Bearer test-token"},
                    json={"key": "mail/attachments/a", "sha256": hashlib.sha256(b"other").hexdigest()})
    assert r.status_code == 200 and r.json()["state"] == "error"
