"""Object storage behind one interface (spec 9.6, decision 12).

Two buckets: public media and private files (CVs). Private files are only reachable
through short-lived signed links. S3Storage uses boto3 (blocking) in a worker thread.
"""

from dataclasses import dataclass, field
from enum import StrEnum
from functools import lru_cache
from typing import Protocol

import boto3
from anyio import to_thread
from botocore.config import Config

from app.core.config import get_settings

MAX_SIGNED_URL_SECONDS = 900  # private links stay short-lived whatever the caller asks for


def clamp_expiry(expires_seconds: int) -> int:
    return max(1, min(expires_seconds, MAX_SIGNED_URL_SECONDS))


class Bucket(StrEnum):
    PUBLIC = "public"
    PRIVATE = "private"


class StorageService(Protocol):
    async def put(self, bucket: Bucket, key: str, data: bytes, content_type: str) -> None: ...
    async def get(self, bucket: Bucket, key: str) -> bytes: ...
    async def delete(self, bucket: Bucket, key: str) -> None: ...
    async def signed_url(self, bucket: Bucket, key: str, expires_seconds: int) -> str: ...


class S3Storage:
    def __init__(self) -> None:
        s = get_settings()
        self._buckets = {Bucket.PUBLIC: s.s3_bucket_public, Bucket.PRIVATE: s.s3_bucket_private}
        self._client = boto3.client(
            "s3",
            endpoint_url=s.s3_endpoint or None,
            region_name=s.s3_region or None,
            aws_access_key_id=s.s3_key or None,
            aws_secret_access_key=s.s3_secret or None,
            config=Config(signature_version="s3v4", retries={"max_attempts": 2}),
        )

    async def put(self, bucket: Bucket, key: str, data: bytes, content_type: str) -> None:
        await to_thread.run_sync(
            lambda: self._client.put_object(
                Bucket=self._buckets[bucket], Key=key, Body=data, ContentType=content_type
            )
        )

    async def get(self, bucket: Bucket, key: str) -> bytes:
        def read() -> bytes:
            return self._client.get_object(Bucket=self._buckets[bucket], Key=key)["Body"].read()

        return await to_thread.run_sync(read)

    async def delete(self, bucket: Bucket, key: str) -> None:
        await to_thread.run_sync(
            lambda: self._client.delete_object(Bucket=self._buckets[bucket], Key=key)
        )

    async def signed_url(self, bucket: Bucket, key: str, expires_seconds: int) -> str:
        return await to_thread.run_sync(
            lambda: self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._buckets[bucket], "Key": key},
                ExpiresIn=clamp_expiry(expires_seconds),
            )
        )


@dataclass
class MemoryStorage:
    """In-memory fake for unit tests that must not touch the network."""

    objects: dict[tuple[Bucket, str], tuple[bytes, str]] = field(default_factory=dict)

    async def put(self, bucket: Bucket, key: str, data: bytes, content_type: str) -> None:
        self.objects[(bucket, key)] = (data, content_type)

    async def get(self, bucket: Bucket, key: str) -> bytes:
        return self.objects[(bucket, key)][0]

    async def delete(self, bucket: Bucket, key: str) -> None:
        self.objects.pop((bucket, key), None)

    async def signed_url(self, bucket: Bucket, key: str, expires_seconds: int) -> str:
        return f"memory://{bucket.value}/{key}?expires={clamp_expiry(expires_seconds)}"


@lru_cache
def get_storage() -> StorageService:
    return S3Storage()
