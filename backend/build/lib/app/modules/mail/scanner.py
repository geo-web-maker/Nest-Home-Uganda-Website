"""HTTP client for the private ClamAV sidecar; attachment bytes stay in object storage."""
from __future__ import annotations

from dataclasses import dataclass
import httpx
import asyncio
import hashlib
import socket
import struct

from app.modules.mail.settings_service import get_value


@dataclass(frozen=True)
class ScanResult:
    state: str
    detail: str = ""


async def scan_object(key: str, sha256: str) -> ScanResult:
    if not bool(await get_value("mail.scan_enabled")):
        return ScanResult("unscanned", "Scanning disabled")
    mode = str(await get_value("mail.scan_mode") or "http").lower()
    timeout = float(await get_value("mail.scan_timeout_seconds") or 60)
    if not key.startswith("mail/attachments/") or ".." in key.split("/"):
        return ScanResult("error", "Invalid attachment object key")
    if mode == "clamd":
        # Local development mode only. Production uses the HTTPS sidecar so file
        # bytes do not cross the backend/scanner boundary.
        from app.core.storage import Bucket, get_storage
        host = str(await get_value("mail.clamd_host") or "127.0.0.1")
        port = int(await get_value("mail.clamd_port") or 3310)
        try:
            data = await get_storage().get(Bucket.MAIL, key)
            if hashlib.sha256(data).hexdigest().lower() != sha256.lower():
                return ScanResult("error", "SHA-256 mismatch")
            state, detail = await asyncio.to_thread(_clamd_scan, host, port, data, timeout)
            return ScanResult(state, detail)
        except Exception as exc:
            return ScanResult("error", type(exc).__name__)
    if mode != "http":
        return ScanResult("error", "Unsupported scanner mode")
    base = str(await get_value("mail.scan_url") or "").rstrip("/")
    token = str(await get_value("mail.scan_token") or "")
    if not base or not token:
        return ScanResult("error", "Scanner is not configured")
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{base}/scan",
                json={"key": key, "sha256": sha256},
                headers={"Authorization": f"Bearer {token}"},
            )
        response.raise_for_status()
        data = response.json()
        state = str(data.get("state", "error"))
        if state not in {"clean", "infected", "error"}:
            return ScanResult("error", "Invalid scanner response")
        return ScanResult(state, str(data.get("detail") or "")[:200])
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        return ScanResult("error", type(exc).__name__)


def _clamd_scan(host: str, port: int, data: bytes, timeout: float) -> tuple[str, str]:
    with socket.create_connection((host, port), timeout=timeout) as sock:
        sock.settimeout(timeout)
        sock.sendall(b"zINSTREAM\0")
        view = memoryview(data)
        for offset in range(0, len(data), 64 * 1024):
            chunk = view[offset:offset + 64 * 1024]
            sock.sendall(struct.pack("!I", len(chunk)))
            sock.sendall(chunk)
        sock.sendall(struct.pack("!I", 0))
        response = bytearray()
        while len(response) < 4096 and not response.endswith(b"\0"):
            part = sock.recv(1024)
            if not part:
                break
            response.extend(part)
    result = bytes(response).decode("utf-8", "replace").strip("\0\r\n")
    if result.endswith(": OK"):
        return "clean", ""
    if result.endswith(" FOUND"):
        return "infected", result.rsplit(": ", 1)[-1].removesuffix(" FOUND")[:160]
    return "error", "Unexpected scanner response"


async def scanner_health() -> tuple[bool, str]:
    """Probe the authenticated scanner sidecar without exposing credentials."""
    mode = str(await get_value("mail.scan_mode") or "http").lower()
    if mode == "clamd":
        host = str(await get_value("mail.clamd_host") or "127.0.0.1")
        port = int(await get_value("mail.clamd_port") or 3310)
        try:
            await asyncio.to_thread(lambda: socket.create_connection((host, port), timeout=3).close())
            return True, "Local clamd is reachable (development mode)."
        except OSError:
            return False, "Local clamd could not be reached."
    base = str(await get_value("mail.scan_url") or "").rstrip("/")
    token = str(await get_value("mail.scan_token") or "")
    if not base or not token:
        return False, "Scanner URL or token is not configured."
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(f"{base}/health", headers={"Authorization": f"Bearer {token}"})
        response.raise_for_status()
        data = response.json()
        return bool(data.get("ok")), "Scanner service is reachable." if data.get("ok") else "Scanner service is not ready."
    except (httpx.HTTPError, ValueError, TypeError):
        return False, "Scanner service could not be reached over HTTPS."
