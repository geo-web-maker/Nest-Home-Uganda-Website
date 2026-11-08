"""The signed-bucket diagnostics probe, run against a fake S3 client (no network)."""

import anyio
from botocore.exceptions import ClientError

from app.core import storage as storage_module
from app.core.storage import Bucket, S3Storage


def _err(code: str, op: str) -> ClientError:
    return ClientError({"Error": {"Code": code, "Message": code}}, op)


class FakeClient:
    def __init__(self, *, lock_enabled=True, default_retention=False, can_write=True, enforce_lock=True, missing_bucket=False):
        self.lock_enabled, self.default_retention = lock_enabled, default_retention
        self.can_write, self.enforce_lock, self.missing_bucket = can_write, enforce_lock, missing_bucket
        self.objects: dict[str, dict] = {}

    def head_bucket(self, Bucket):
        if self.missing_bucket:
            raise _err("NoSuchBucket", "HeadBucket")

    def get_object_lock_configuration(self, Bucket):
        if not self.lock_enabled:
            raise _err("ObjectLockConfigurationNotFoundError", "GetObjectLockConfiguration")
        rule = {"Rule": {"DefaultRetention": {"Mode": "GOVERNANCE", "Days": 5}}} if self.default_retention else {}
        return {"ObjectLockConfiguration": {"ObjectLockEnabled": "Enabled", **rule}}

    def list_object_versions(self, Bucket, Prefix):
        return {"Versions": [{"Key": k, "VersionId": "v1"} for k in self.objects]}

    def put_object(self, Bucket, Key, Body, ContentType, ObjectLockMode, ObjectLockRetainUntilDate):
        if not self.can_write:
            raise _err("AccessDenied", "PutObject")
        self.objects[Key] = {"body": Body, "mode": ObjectLockMode}
        return {"VersionId": "v1"}

    def get_object(self, Bucket, Key):
        class Body:
            def __init__(self, data): self.data = data
            def read(self): return self.data
        return {"Body": Body(self.objects[Key]["body"])}

    def get_object_retention(self, Bucket, Key, VersionId=None):
        return {"Retention": {"Mode": self.objects[Key]["mode"]}}

    def delete_object(self, Bucket, Key, VersionId=None):
        if self.enforce_lock:
            raise _err("AccessDenied", "DeleteObject")
        self.objects.pop(Key, None)


def _probe(client: FakeClient, monkeypatch) -> dict[str, str]:
    store = object.__new__(S3Storage)
    store._buckets = {Bucket.SIGNED: "signed-test"}
    store._signed_client = client
    store._client = client
    monkeypatch.setenv("NEST_S3_SIGNED_LOCK_MODE", "GOVERNANCE")
    storage_module.get_settings.cache_clear() if hasattr(storage_module.get_settings, "cache_clear") else None
    results = anyio.run(store.probe_signed)
    return {item["id"]: item["status"] for item in results}


def test_healthy_bucket_passes_every_step(monkeypatch):
    got = _probe(FakeClient(), monkeypatch)
    assert got["agreement_signed_bucket_connect"] == "pass"
    assert got["agreement_signed_bucket_lock"] == "pass"
    assert got["agreement_signed_bucket_write"] == "pass"
    assert got["agreement_signed_bucket_retention"] == "pass"
    assert got["agreement_signed_bucket_enforced"] == "pass"


def test_bucket_without_object_lock_fails_early(monkeypatch):
    got = _probe(FakeClient(lock_enabled=False), monkeypatch)
    assert got["agreement_signed_bucket_lock"] == "fail"
    assert "agreement_signed_bucket_write" not in got


def test_wrong_bucket_name_fails_connect(monkeypatch):
    got = _probe(FakeClient(missing_bucket=True), monkeypatch)
    assert got["agreement_signed_bucket_connect"] == "fail"
    assert "agreement_signed_bucket_lock" not in got


def test_key_that_cannot_write_fails(monkeypatch):
    assert _probe(FakeClient(can_write=False), monkeypatch)["agreement_signed_bucket_write"] == "fail"


def test_lock_not_enforced_is_flagged(monkeypatch):
    assert _probe(FakeClient(enforce_lock=False), monkeypatch)["agreement_signed_bucket_enforced"] == "fail"


def test_default_retention_warns(monkeypatch):
    assert _probe(FakeClient(default_retention=True), monkeypatch)["agreement_signed_bucket_lock"] == "warn"
