"""Brevo SMTP trace with credential-safe diagnostics.

The trace records connection, TLS, authentication outcomes and server replies. It
never returns stored secrets, and SMTP AUTH command/response payloads are redacted.
Short fingerprints permit comparison without exposing credentials.
"""

from __future__ import annotations

import asyncio
import hashlib
import socket
import time
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from typing import Any, Awaitable, Callable

import httpx

Getter = Callable[[str], Awaitable[Any]]
SMTP_KEY_PREFIX = "xsmtpsib-"  # Brevo SMTP keys
API_KEY_PREFIX = "xkeysib-"  # Brevo API keys (a different credential)
TIMEOUT = 20


def _text(value: Any) -> str:
    return str(value)[:4000]


def describe_secret(value: str, compare: str | None = None) -> dict[str, Any]:
    """Expose useful credential diagnostics without returning the credential itself."""
    info: dict[str, Any] = {
        "kind": "smtp_key" if value.startswith(SMTP_KEY_PREFIX) else "api_key" if value.startswith(API_KEY_PREFIX) else "unknown",
        "length": len(value),
        "has_leading_or_trailing_space": value != value.strip(),
        "has_inner_whitespace": any(ch.isspace() for ch in value.strip()),
        "has_non_ascii": any(ord(ch) > 127 for ch in value),
        "has_quote_chars": any(ch in value for ch in "\"'`"),
        "fingerprint": hashlib.sha256(value.encode()).hexdigest()[:8] if value else "",
    }
    if compare is not None:
        info["matches_supplied_key"] = value == compare
        info["supplied_key_fingerprint"] = hashlib.sha256(compare.encode()).hexdigest()[:8]
    return info


def describe_username(value: str) -> dict[str, Any]:
    return {
        "value": value,
        "repr": repr(value),
        "hex": value.encode("utf-8", "replace").hex(),
        "length": len(value),
        "has_leading_or_trailing_space": value != value.strip(),
        "has_non_ascii": any(ord(ch) > 127 for ch in value),
        "ends_with_smtp_brevo_com": value.strip().lower().endswith("@smtp-brevo.com"),
    }


class _Trace:
    def __init__(self) -> None:
        self.steps: list[dict[str, Any]] = []

    def add(self, step: str, ok: bool, detail: Any = None, started: float | None = None, **extra: Any) -> dict[str, Any]:
        entry: dict[str, Any] = {"step": step, "ok": ok}
        if started is not None:
            entry["ms"] = round((time.monotonic() - started) * 1000)
        if detail is not None:
            entry["detail"] = _text(detail)
        entry.update(extra)
        self.steps.append(entry)
        return entry

    def fail_from(self, step: str, exc: BaseException, started: float) -> None:
        code = getattr(exc, "code", None)
        message = getattr(exc, "message", None)
        self.add(
            step,
            False,
            message if message is not None else str(exc) or type(exc).__name__,
            started,
            error_type=type(exc).__name__,
            smtp_code=code if isinstance(code, int) else None,
        )


def _response(resp: Any) -> tuple[int | None, str]:
    code = getattr(resp, "code", None)
    message = getattr(resp, "message", None)
    return (code if isinstance(code, int) else None), str(message if message is not None else resp)


def _hook_wire(client: Any, wire: list[dict[str, Any]]) -> None:
    """Record SMTP protocol lines while redacting every AUTH command and response payload."""
    protocol = client.protocol
    if protocol is None:
        return
    real_write, real_receive = protocol.write, protocol.data_received
    auth_in_progress = False

    def write(data: bytes) -> None:
        nonlocal auth_in_progress
        text = data.decode("utf-8", "replace")
        for line in text.split("\r\n"):
            if not line:
                continue
            if line.upper().startswith("AUTH "):
                auth_in_progress = True
                wire.append({"dir": "client", "line": "AUTH [credentials redacted]"})
            elif auth_in_progress:
                wire.append({"dir": "client", "line": "[AUTH payload redacted]"})
            else:
                wire.append({"dir": "client", "line": line})
        real_write(data)

    def data_received(data: bytes) -> None:
        nonlocal auth_in_progress
        text = data.decode("utf-8", "replace")
        for line in text.split("\r\n"):
            if not line:
                continue
            wire.append({"dir": "server", "line": line})
            # AUTH continues through 334 challenges and ends with a final success/failure code.
            if auth_in_progress and line[:3] in {"235", "535", "534", "454", "503"}:
                auth_in_progress = False
        real_receive(data)

    protocol.write, protocol.data_received = write, data_received  # type: ignore[method-assign]


def _hook_auth_attempts(client: Any, trace: "_Trace") -> None:
    """aiosmtplib tries each login method the server offers and only raises the last failure. Record each one."""
    for method in ("auth_crammd5", "auth_plain", "auth_login"):
        original = getattr(client, method)

        async def wrapped(*args: Any, _original: Any = original, _method: str = method, **kwargs: Any) -> Any:
            began = time.monotonic()
            try:
                result = await _original(*args, **kwargs)
            except Exception as exc:
                trace.fail_from(f"auth_attempt:{_method.removeprefix('auth_')}", exc, began)
                raise
            code, message = _response(result)
            trace.add(f"auth_attempt:{_method.removeprefix('auth_')}", True, message, began, smtp_code=code)
            return result

        setattr(client, method, wrapped)


def _result(trace: "_Trace", wire: list[dict[str, Any]], egress_ip: str | None, notes: list[str]) -> dict[str, Any]:
    import platform
    try:
        import aiosmtplib
        lib = aiosmtplib.__version__
    except Exception:
        lib = "unknown"
    return {"steps": trace.steps, "wire": wire, "egress_ip": egress_ip, "notes": notes, "versions": {"aiosmtplib": lib, "python": platform.python_version()}}


def diagnose(steps: list[dict[str, Any]], user: dict[str, Any], key: dict[str, Any], egress_ip: str | None) -> list[str]:
    """Plain-language reading of the trace. These are hints from evidence, not certainties."""
    notes: list[str] = []
    by = {s["step"]: s for s in steps}
    login = by.get("auth")
    if login is not None and not login["ok"] and (login.get("smtp_code") in (535, 534, 454) or login.get("error_type") == "SMTPAuthenticationError"):
        notes.append("The server was reached and TLS worked, and it refused the login. The network path is fine; this is about the credentials or the account.")
        if user["has_leading_or_trailing_space"] or user["has_non_ascii"]:
            notes.append("FOUND IT: the saved SMTP username has a leading or trailing space (or an odd character). Brevo receives it as part of the login and refuses it. Re-save the username with no spaces.")
        if key["kind"] == "api_key":
            notes.append("The saved key starts with xkeysib-, which is a Brevo API key. SMTP needs an SMTP key (starts with xsmtpsib-).")
        if key["has_leading_or_trailing_space"] or key["has_inner_whitespace"] or key["has_quote_chars"] or key["has_non_ascii"]:
            notes.append("The saved key contains whitespace, quotes or non-ASCII characters. Re-save it clean.")
        if key.get("matches_supplied_key") is False:
            notes.append("The saved key is NOT the key you supplied for comparison. Re-save the supplied key.")
        if not user["ends_with_smtp_brevo_com"]:
            notes.append("The SMTP username should be the Brevo SMTP login ending in @smtp-brevo.com, not your account email.")
        if key.get("matches_supplied_key") is True and key["kind"] != "api_key":
            notes.append(
                "The saved key matches the one you supplied, so if that same key logs in from your own computer, the likely cause is Brevo refusing this server's IP"
                + (f" ({egress_ip})" if egress_ip else "")
                + ". Check Brevo > Security > Authorized IPs, or that the key was not deleted or regenerated."
            )
        elif key.get("matches_supplied_key") is None:
            notes.append(
                "Credentials look well-formed. If the same key logs in from another computer, the likely cause is Brevo refusing this server's IP"
                + (f" ({egress_ip})" if egress_ip else "")
                + ". Supply the working key in the comparison box to rule out a saved-key mismatch."
            )
    elif login is not None and login["ok"]:
        notes.append("Login succeeded from this server, so the credentials and IP rules are fine. Look at the send steps or the sender address.")
    conn = by.get("tcp_connect")
    if conn is not None and not conn["ok"]:
        notes.append("This server cannot open the SMTP port. Try port 2525, or the Brevo API transport.")
    return notes


async def run_trace(
    get: Getter,
    *,
    send_to: str | None = None,
    compare_key: str | None = None,
    http_client_factory: Callable[[], httpx.AsyncClient] | None = None,
) -> dict[str, Any]:
    """Run the trace. ``get`` reads a mail setting by key (it may raise for an unreadable secret)."""
    trace = _Trace()
    wire: list[dict[str, Any]] = []

    values: dict[str, Any] = {}
    started = time.monotonic()
    try:
        for name in ("provider", "brevo_transport", "smtp_host", "smtp_port", "smtp_username", "smtp_password", "domain", "from_name"):
            values[name] = await get(f"mail.{name}")
    except Exception as exc:  # an undecryptable secret surfaces here, with its real message
        trace.fail_from("read_settings", exc, started)
        return {"steps": trace.steps, "notes": ["A saved setting could not be read. If it names a secret, replace that secret in Mail settings."]}

    host = str(values["smtp_host"] or "smtp-relay.brevo.com")
    port = int(values["smtp_port"] or 587)
    username = str(values["smtp_username"] or "")
    password = str(values["smtp_password"] or "")
    transport = str(values["brevo_transport"] or "smtp").lower()
    implicit_tls = port == 465
    user_info = describe_username(username)
    key_info = describe_secret(password, compare_key)

    trace.add(
        "settings",
        True,
        "These are the values the sender will use.",
        provider=str(values["provider"] or ""),
        transport=transport,
        host=host,
        port=port,
        tls_mode="implicit TLS" if implicit_tls else "STARTTLS",
        username=user_info,
        password=key_info,
    )
    if str(values["provider"] or "").lower() != "brevo" or transport != "smtp":
        trace.add("transport", False, "Provider is not Brevo over SMTP, so there is no SMTP login to trace.")
        return {"steps": trace.steps, "notes": []}
    if not username or not password:
        trace.add("credentials", False, "SMTP username or password is empty.")
        return {"steps": trace.steps, "notes": ["Save the SMTP username and SMTP key first."]}

    # Where this server appears to come from. This is the address Brevo's Authorized IPs list must allow.
    egress_ip: str | None = None
    started = time.monotonic()
    try:
        client = http_client_factory() if http_client_factory else httpx.AsyncClient(timeout=6)
        async with client:
            resp = await client.get("https://api.ipify.org")
        egress_ip = resp.text.strip()[:64] if resp.is_success else None
        trace.add("egress_ip", egress_ip is not None, egress_ip or f"lookup returned HTTP {resp.status_code}", started)
    except Exception as exc:
        trace.fail_from("egress_ip", exc, started)

    started = time.monotonic()
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
        trace.add("dns", True, ", ".join(sorted({i[4][0] for i in infos})), started)
    except Exception as exc:
        trace.fail_from("dns", exc, started)
        return _result(trace, wire, egress_ip, diagnose(trace.steps, user_info, key_info, egress_ip))

    started = time.monotonic()
    try:
        _, writer = await asyncio.wait_for(asyncio.open_connection(host, port), timeout=TIMEOUT)
        writer.close()
        await writer.wait_closed()
        trace.add("tcp_connect", True, f"{host}:{port} accepted a plain TCP connection.", started)
    except Exception as exc:
        trace.fail_from("tcp_connect", exc, started)
        return _result(trace, wire, egress_ip, diagnose(trace.steps, user_info, key_info, egress_ip))

    from aiosmtplib import SMTP

    client = SMTP(hostname=host, port=port, use_tls=implicit_tls, start_tls=False, timeout=TIMEOUT)
    connected = False

    async def step(name: str, call: Awaitable[Any], detail_prefix: str = "") -> Any:
        began = time.monotonic()
        try:
            result = await call
        except Exception as exc:
            trace.fail_from(name, exc, began)
            return None
        code, message = _response(result)
        trace.add(name, True, f"{detail_prefix}{message}", began, smtp_code=code)
        return result

    try:
        if await step("smtp_connect", client.connect(), "Server greeting: ") is not None:
            connected = True
            _hook_wire(client, wire)
            _hook_auth_attempts(client, trace)
            await step("ehlo", client.ehlo())
            trace.steps[-1]["server_extensions"] = {k: _text(v) for k, v in (getattr(client, "esmtp_extensions", {}) or {}).items()}
            ok = True
            if not implicit_tls:
                ok = await step("starttls", client.starttls()) is not None
                if ok:
                    ok = await step("ehlo_after_tls", client.ehlo()) is not None
                    if ok:
                        trace.steps[-1]["server_extensions"] = {k: _text(v) for k, v in (getattr(client, "esmtp_extensions", {}) or {}).items()}
            if ok:
                logged_in = await step("auth", client.login(username, password), "Login accepted: ") is not None
                if logged_in and send_to:
                    sender = f"no-reply@{values['domain']}" if values["domain"] else username
                    msg = EmailMessage()
                    msg["From"] = f"{values['from_name'] or 'Mail test'} <{sender}>"
                    msg["To"] = send_to
                    msg["Subject"] = "SMTP trace test"
                    msg["Date"] = formatdate(localtime=False)
                    msg["Message-ID"] = make_msgid()
                    msg.set_content("This message was sent by the SMTP trace in Mail settings.")
                    began = time.monotonic()
                    try:
                        errors, response = await client.send_message(msg, sender=sender, recipients=[send_to])
                        code, message = _response(response)
                        refused = {addr: _text(getattr(err, "message", err)) for addr, err in (errors or {}).items()}
                        trace.add("send", not refused, message, began, smtp_code=code, envelope_from=sender, envelope_to=send_to, refused=refused)
                    except Exception as exc:
                        trace.fail_from("send", exc, began)
    finally:
        if connected:
            try:
                await asyncio.wait_for(client.quit(), timeout=5)
            except Exception:
                try:
                    client.close()
                except Exception:
                    pass

    return _result(trace, wire, egress_ip, diagnose(trace.steps, user_info, key_info, egress_ip))
