"""Private ClamAV scan sidecar. Only object keys and verdicts cross the API boundary."""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import socket
import struct
from typing import Any

import boto3
from botocore.config import Config
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

log = logging.getLogger("nest.scanner")
app = FastAPI(title="Nest private attachment scanner", docs_url=None, redoc_url=None)

MAX_BYTES = int(os.getenv("SCAN_MAX_BYTES", str(25 * 1024 * 1024)))
TOKEN = os.getenv("SCAN_BEARER_TOKEN", "")
CLAMD_HOST = os.getenv("CLAMD_HOST", "clamav")
CLAMD_PORT = int(os.getenv("CLAMD_PORT", "3310"))


class ScanRequest(BaseModel):
    key: str = Field(min_length=1, max_length=512)
    sha256: str = Field(pattern=r"^[a-fA-F0-9]{64}$")


def _s3():
    return boto3.client(
        "s3",
        endpoint_url=os.environ["NEST_S3_ENDPOINT"],
        region_name=os.getenv("NEST_S3_REGION", "auto"),
        aws_access_key_id=os.environ["NEST_S3_READ_KEY"],
        aws_secret_access_key=os.environ["NEST_S3_READ_SECRET"],
        config=Config(signature_version="s3v4"),
    )


def _clamd_scan(data: bytes) -> tuple[str, str]:
    """ClamD INSTREAM protocol: zINSTREAM NUL, length-prefixed chunks, zero end."""
    with socket.create_connection((CLAMD_HOST, CLAMD_PORT), timeout=50) as sock:
        sock.settimeout(50)
        sock.sendall(b"zINSTREAM\0")
        view = memoryview(data)
        for offset in range(0, len(data), 64 * 1024):
            chunk = view[offset : offset + 64 * 1024]
            sock.sendall(struct.pack("!I", len(chunk)))
            sock.sendall(chunk)
        sock.sendall(struct.pack("!I", 0))
        reply = b""
        while not reply.endswith(b"\0") and len(reply) < 4096:
            part = sock.recv(1024)
            if not part:
                break
            reply += part
    result = reply.decode("utf-8", "replace").strip("\0\r\n")
    if result.endswith(": OK"):
        return "clean", ""
    if result.endswith(" FOUND"):
        return "infected", result.rsplit(": ", 1)[-1].removesuffix(" FOUND")
    return "error", "Unexpected scanner response"


@app.get("/health")
def health() -> dict[str, Any]:
    try:
        with socket.create_connection((CLAMD_HOST, CLAMD_PORT), timeout=2):
            return {"ok": True, "scanner": "reachable"}
    except OSError:
        raise HTTPException(503, "Scanner unavailable")


@app.post("/scan")
def scan(body: ScanRequest, authorization: str | None = Header(default=None)):
    if not TOKEN or not hmac.compare_digest((authorization or "").encode(), f"Bearer {TOKEN}".encode()):
        raise HTTPException(401, "Unauthorized")
    if not body.key.startswith("mail/attachments/") or ".." in body.key.split("/"):
        raise HTTPException(400, "Invalid object key")
    bucket = os.environ["NEST_S3_BUCKET_MAIL"]
    response = None
    try:
        response = _s3().get_object(Bucket=bucket, Key=body.key)
        if int(response.get("ContentLength", 0)) > MAX_BYTES:
            return {"state": "error", "detail": "File exceeds scanner size limit"}
        digest = hashlib.sha256()
        chunks = []
        total = 0
        stream = response["Body"]
        while True:
            chunk = stream.read(64 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_BYTES:
                return {"state": "error", "detail": "File exceeds scanner size limit"}
            digest.update(chunk)
            chunks.append(chunk)
        if digest.hexdigest().lower() != body.sha256.lower():
            return {"state": "error", "detail": "SHA-256 mismatch"}
        state, detail = _clamd_scan(b"".join(chunks))
        return {"state": state, "detail": detail[:200]}
    except Exception as exc:  # Never log object keys, filenames, or file bytes.
        log.warning("Attachment scan failed (%s)", type(exc).__name__)
        return {"state": "error", "detail": "Scanner service error"}
    finally:
        if response is not None:
            try:
                response["Body"].close()
            except Exception:
                pass
