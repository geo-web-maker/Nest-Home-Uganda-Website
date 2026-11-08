"""Object storage behind one interface (spec 9.6, decision 12).

Two buckets: public media and private files (CVs). Private files are only reachable
through short-lived signed links. S3Storage uses boto3 (blocking) in a worker thread.
"""

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from functools import lru_cache
from typing import Protocol
from urllib.parse import quote

import boto3
from anyio import to_thread
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import get_settings

MAX_SIGNED_URL_SECONDS = 900  # private links stay short-lived whatever the caller asks for


def clamp_expiry(expires_seconds: int) -> int:
    return max(1, min(expires_seconds, MAX_SIGNED_URL_SECONDS))


class Bucket(StrEnum):
    PUBLIC = "public"
    PRIVATE = "private"
    MAIL = "mail"
    SIGNED = "signed"


def content_disposition(filename: str) -> str:
    """Build an RFC 6266 attachment disposition with an ASCII and UTF-8 filename."""
    cleaned = str(filename or "attachment")
    cleaned = "".join(
        char for char in cleaned
        if ord(char) >= 32 and ord(char) != 127
        and not (0x202A <= ord(char) <= 0x202E)
        and not (0x2066 <= ord(char) <= 0x2069)
    )
    cleaned = cleaned.replace('"', "_").replace("\\", "_").replace("/", "_").strip() or "attachment"
    fallback = cleaned.encode("ascii", errors="replace").decode("ascii")
    fallback = "".join(char if 32 <= ord(char) < 127 else "_" for char in fallback)
    fallback = fallback.replace("\\", "_").replace('"', "_")
    encoded = quote(cleaned.encode("utf-8"), safe="")
    return f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{encoded}"


class StorageService(Protocol):
    async def put(self, bucket: Bucket, key: str, data: bytes, content_type: str) -> None: ...
    async def get(self, bucket: Bucket, key: str) -> bytes: ...
    async def delete(self, bucket: Bucket, key: str) -> None: ...
    async def put_locked(
        self, bucket: Bucket, key: str, data: bytes, content_type: str, retain_days: int
    ) -> None: ...
    async def copy(self, bucket: Bucket, src_key: str, dst_key: str) -> None: ...
    async def signed_url(
        self, bucket: Bucket, key: str, expires_seconds: int, *,
        download_filename: str | None = None, content_type: str | None = None
    ) -> str: ...
    async def presigned_put(
        self, bucket: Bucket, key: str, content_type: str, expires_seconds: int = 300
    ) -> str: ...


class S3Storage:
    def __init__(self) -> None:
        s = get_settings()
        self._buckets = {
            Bucket.PUBLIC: s.s3_bucket_public,
            Bucket.PRIVATE: s.s3_bucket_private,
            Bucket.MAIL: s.s3_bucket_mail,
            Bucket.SIGNED: s.s3_bucket_signed,
        }
        self._lock_mode = (s.s3_signed_lock_mode or "GOVERNANCE").upper()
        self._client = boto3.client(
            "s3",
            endpoint_url=s.s3_endpoint or None,
            region_name=s.s3_region or None,
            aws_access_key_id=s.s3_key or None,
            aws_secret_access_key=s.s3_secret or None,
            config=Config(signature_version="s3v4", retries={"max_attempts": 2}),
        )
        # Sealed agreements may live on a different provider/account (e.g. a dedicated Backblaze B2 bucket).
        self._signed_client = None
        if s.s3_bucket_signed and (s.s3_signed_endpoint or s.s3_signed_key):
            self._signed_client = boto3.client(
                "s3",
                endpoint_url=s.s3_signed_endpoint or s.s3_endpoint or None,
                region_name=s.s3_signed_region or s.s3_region or None,
                aws_access_key_id=s.s3_signed_key or s.s3_key or None,
                aws_secret_access_key=s.s3_signed_secret or s.s3_secret or None,
                config=Config(signature_version="s3v4", retries={"max_attempts": 2}),
            )

    def _c(self, bucket: Bucket):
        if bucket is Bucket.SIGNED and self._signed_client is not None:
            return self._signed_client
        return self._client

    async def put_locked(
        self, bucket: Bucket, key: str, data: bytes, content_type: str, retain_days: int
    ) -> None:
        """Write once with an Object Lock retention period (bucket must have Object Lock enabled)."""
        if not self._buckets[bucket]:
            raise ValueError(f"Storage bucket {bucket.value!r} is not configured")
        until = datetime.now(UTC) + timedelta(days=max(1, retain_days))
        await to_thread.run_sync(
            lambda: self._c(bucket).put_object(
                Bucket=self._buckets[bucket], Key=key, Body=data, ContentType=content_type,
                ObjectLockMode=self._lock_mode, ObjectLockRetainUntilDate=until,
            )
        )

    async def probe_signed(self, retain_days: int = 1) -> list[dict[str, str]]:
        """Diagnostics only: exercise the sealed-agreements bucket the way a real countersign does.

        Checks reachability, Object Lock, a locked write with read-back, the stored retention and that
        deleting a locked version is refused. The probe file is tiny and stays locked for ``retain_days``;
        the next run removes expired probes. Real agreements are never touched.
        """
        s = get_settings()
        bucket_name = self._buckets[Bucket.SIGNED]
        client = self._c(Bucket.SIGNED)
        prefix = "agreements/diagnostics/signed-probe-"

        def run() -> list[dict[str, str]]:
            out: list[dict[str, str]] = []

            def add(check_id: str, status: str, detail: str) -> None:
                out.append({"id": check_id, "status": status, "detail": detail})

            def code(exc: Exception) -> str:
                if isinstance(exc, ClientError):
                    return str(exc.response.get("Error", {}).get("Code") or "ClientError")
                return type(exc).__name__

            mode = (s.s3_signed_lock_mode or "").upper()
            own = self._signed_client is not None
            if mode not in {"GOVERNANCE", "COMPLIANCE"}:
                add("agreement_signed_bucket_config", "fail",
                    f"Lock mode {s.s3_signed_lock_mode!r} is not valid. Use GOVERNANCE or COMPLIANCE.")
            elif s.s3_signed_retention_days < 1:
                add("agreement_signed_bucket_config", "fail", "Retention days must be at least 1.")
            else:
                add("agreement_signed_bucket_config", "pass",
                    f"Bucket {bucket_name!r}, {mode} mode, {s.s3_signed_retention_days} days retention; "
                    + ("using its own endpoint and credentials." if own else
                       "no signed endpoint or key set, so the main storage endpoint and credentials are used."))
                if not own and not s.s3_endpoint:
                    add("agreement_signed_bucket_config", "warn", "No endpoint is set for the signed bucket or main storage.")

            try:
                client.head_bucket(Bucket=bucket_name)
                add("agreement_signed_bucket_connect", "pass", "The signed bucket is reachable with these credentials.")
            except Exception as exc:
                add("agreement_signed_bucket_connect", "fail",
                    f"Could not open bucket {bucket_name!r} ({code(exc)}). Check the bucket name, endpoint, region and key.")
                return out

            try:
                lock = client.get_object_lock_configuration(Bucket=bucket_name).get("ObjectLockConfiguration", {})
                if lock.get("ObjectLockEnabled") == "Enabled":
                    if lock.get("Rule", {}).get("DefaultRetention"):
                        add("agreement_signed_bucket_lock", "warn",
                            "Object Lock is on, but the bucket has a default retention. Remove it; the app sets retention per file.")
                    else:
                        add("agreement_signed_bucket_lock", "pass", "Object Lock is enabled on the bucket.")
                else:
                    add("agreement_signed_bucket_lock", "fail",
                        "Object Lock is not enabled. It can only be turned on when a bucket is created; make a new bucket.")
                    return out
            except Exception as exc:
                if code(exc) in {"ObjectLockConfigurationNotFoundError", "NoSuchObjectLockConfiguration"}:
                    add("agreement_signed_bucket_lock", "fail",
                        "Object Lock is not enabled. It can only be turned on when a bucket is created; make a new bucket.")
                    return out
                add("agreement_signed_bucket_lock", "warn",
                    f"Could not read the Object Lock setting ({code(exc)}). Allow the key to read bucket settings, or confirm it in the provider console.")

            removed = 0
            list_failed = ""
            try:
                listing = client.list_object_versions(Bucket=bucket_name, Prefix=prefix)
                for item in [*listing.get("Versions", []), *listing.get("DeleteMarkers", [])]:
                    try:
                        client.delete_object(Bucket=bucket_name, Key=item["Key"], VersionId=item["VersionId"])
                        removed += 1
                    except Exception:
                        pass
            except Exception as exc:
                list_failed = code(exc)

            key = f"{prefix}{uuid.uuid4().hex}.txt"
            payload = b"Bloomwell signed-bucket diagnostics - synthetic data only"
            until = datetime.now(UTC) + timedelta(days=max(1, retain_days))
            version = None
            try:
                put = client.put_object(Bucket=bucket_name, Key=key, Body=payload, ContentType="text/plain",
                                        ObjectLockMode=mode if mode in {"GOVERNANCE", "COMPLIANCE"} else "GOVERNANCE",
                                        ObjectLockRetainUntilDate=until)
                version = put.get("VersionId")
                same = client.get_object(Bucket=bucket_name, Key=key)["Body"].read() == payload
                add("agreement_signed_bucket_write", "pass" if same else "fail",
                    "A locked probe file was written and read back." if same else "The probe file read back different bytes.")
            except Exception as exc:
                add("agreement_signed_bucket_write", "fail",
                    f"The locked write failed ({code(exc)}). A real countersign would fail the same way; check the key can write files and set retention.")
                return out

            try:
                kept = client.get_object_retention(Bucket=bucket_name, Key=key, **({"VersionId": version} if version else {}))
                got = kept.get("Retention", {})
                if got.get("Mode") == mode:
                    add("agreement_signed_bucket_retention", "pass", f"Retention was recorded ({mode}).")
                else:
                    add("agreement_signed_bucket_retention", "fail", f"Retention came back as {got.get('Mode')!r}, expected {mode}.")
            except Exception as exc:
                add("agreement_signed_bucket_retention", "warn",
                    f"Could not read the retention back ({code(exc)}). Allow the key to read file retention.")

            if not version:
                add("agreement_signed_bucket_enforced", "warn", "The provider returned no version id, so the lock could not be tested.")
            else:
                try:
                    client.delete_object(Bucket=bucket_name, Key=key, VersionId=version)
                    add("agreement_signed_bucket_enforced", "fail",
                        "A locked file was deleted. Object Lock is not protecting this bucket; check the key has no bypass permission.")
                except Exception as exc:
                    if isinstance(exc, ClientError):
                        add("agreement_signed_bucket_enforced", "pass", "Deleting the locked probe was refused, so the lock is being enforced.")
                    else:
                        add("agreement_signed_bucket_enforced", "warn", f"Delete test was inconclusive ({code(exc)}).")

            if list_failed:
                add("agreement_signed_bucket_cleanup", "warn",
                    f"Could not list old probe files ({list_failed}). Each run leaves one tiny file; delete them from the console when they unlock.")
            else:
                add("agreement_signed_bucket_cleanup", "pass",
                    f"Removed {removed} expired probe file(s). This run's probe stays locked until {until:%Y-%m-%d %H:%M} UTC, then the next run removes it.")
            return out

        return await to_thread.run_sync(run)

    async def put(self, bucket: Bucket, key: str, data: bytes, content_type: str) -> None:
        await to_thread.run_sync(
            lambda: self._c(bucket).put_object(
                Bucket=self._buckets[bucket], Key=key, Body=data, ContentType=content_type
            )
        )

    async def get(self, bucket: Bucket, key: str) -> bytes:
        def read() -> bytes:
            return self._c(bucket).get_object(Bucket=self._buckets[bucket], Key=key)["Body"].read()

        return await to_thread.run_sync(read)

    async def delete(self, bucket: Bucket, key: str) -> None:
        await to_thread.run_sync(
            lambda: self._c(bucket).delete_object(Bucket=self._buckets[bucket], Key=key)
        )

    async def copy(self, bucket: Bucket, src_key: str, dst_key: str) -> None:
        if not self._buckets[bucket]:
            raise ValueError(f"Storage bucket {bucket.value!r} is not configured")
        await to_thread.run_sync(
            lambda: self._c(bucket).copy_object(
                Bucket=self._buckets[bucket],
                Key=dst_key,
                CopySource={"Bucket": self._buckets[bucket], "Key": src_key},
                MetadataDirective="COPY",
            )
        )

    async def signed_url(
        self, bucket: Bucket, key: str, expires_seconds: int, *,
        download_filename: str | None = None, content_type: str | None = None
    ) -> str:
        if not self._buckets[bucket]:
            raise ValueError(f"Storage bucket {bucket.value!r} is not configured")
        params = {"Bucket": self._buckets[bucket], "Key": key}
        if download_filename:
            params["ResponseContentDisposition"] = content_disposition(download_filename)
        if content_type:
            params["ResponseContentType"] = content_type
        return await to_thread.run_sync(
            lambda: self._c(bucket).generate_presigned_url(
                "get_object", Params=params, ExpiresIn=clamp_expiry(expires_seconds)
            )
        )

    async def presigned_put(
        self, bucket: Bucket, key: str, content_type: str, expires_seconds: int = 300
    ) -> str:
        if not self._buckets[bucket]:
            raise ValueError(f"Storage bucket {bucket.value!r} is not configured")
        return await to_thread.run_sync(
            lambda: self._c(bucket).generate_presigned_url(
                "put_object",
                Params={
                    "Bucket": self._buckets[bucket],
                    "Key": key,
                    "ContentType": content_type,
                },
                ExpiresIn=clamp_expiry(expires_seconds),
            )
        )


@dataclass
class MemoryStorage:
    """In-memory fake for unit tests that must not touch the network."""

    objects: dict[tuple[Bucket, str], tuple[bytes, str]] = field(default_factory=dict)
    locked: set[tuple[Bucket, str]] = field(default_factory=set)

    async def put(self, bucket: Bucket, key: str, data: bytes, content_type: str) -> None:
        self.objects[(bucket, key)] = (data, content_type)

    async def get(self, bucket: Bucket, key: str) -> bytes:
        return self.objects[(bucket, key)][0]

    async def delete(self, bucket: Bucket, key: str) -> None:
        if (bucket, key) in self.locked:
            raise PermissionError("object is under retention lock")
        self.objects.pop((bucket, key), None)

    async def put_locked(
        self, bucket: Bucket, key: str, data: bytes, content_type: str, retain_days: int
    ) -> None:
        if (bucket, key) in self.locked:
            raise PermissionError("object is under retention lock")
        self.objects[(bucket, key)] = (data, content_type)
        self.locked.add((bucket, key))

    async def copy(self, bucket: Bucket, src_key: str, dst_key: str) -> None:
        self.objects[(bucket, dst_key)] = self.objects[(bucket, src_key)]

    async def signed_url(
        self, bucket: Bucket, key: str, expires_seconds: int, *,
        download_filename: str | None = None, content_type: str | None = None
    ) -> str:
        url = f"memory://{bucket.value}/{key}?expires={clamp_expiry(expires_seconds)}"
        if download_filename:
            url += f"&filename={quote(download_filename, safe='')}"
        if content_type:
            url += f"&content_type={quote(content_type, safe='/')}"
        return url

    async def presigned_put(
        self, bucket: Bucket, key: str, content_type: str, expires_seconds: int = 300
    ) -> str:
        return (
            f"memory://{bucket.value}/{key}?method=PUT"
            f"&content_type={content_type}&expires={clamp_expiry(expires_seconds)}"
        )


@lru_cache
def get_storage() -> StorageService:
    return S3Storage()
