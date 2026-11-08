import base64

from app.modules.mail.smtp_trace import _hook_wire, describe_secret


def test_secret_description_never_returns_password_or_suffix():
    secret = "xsmtpsib-" + "a" * 40 + "-NeverEchoThis"
    described = describe_secret(secret, compare="xsmtpsib-known-working-key")
    rendered = repr(described)
    assert secret not in rendered
    assert "NeverEchoThis" not in rendered
    assert "last4" not in described
    assert "value" not in described
    assert described["fingerprint"]
    assert "supplied_key_fingerprint" in described


def test_smtp_auth_wire_trace_redacts_inline_and_challenge_credentials():
    user = "user@smtp-brevo.com"
    password = "xsmtpsib-secret-value"
    encoded = base64.b64encode(("\0" + user + "\0" + password).encode()).decode()

    class Protocol:
        def __init__(self):
            self.writes = []
            self.received = []
        def write(self, data):
            self.writes.append(data)
        def data_received(self, data):
            self.received.append(data)

    protocol = Protocol()
    wire = []
    _hook_wire(type("Client", (), {"protocol": protocol})(), wire)
    protocol.write(f"AUTH PLAIN {encoded}\r\n".encode())
    protocol.data_received(b"334 continue\r\n")
    protocol.write((encoded + "\r\n").encode())
    protocol.data_received(b"235 2.7.0 authenticated\r\n")

    rendered = repr(wire)
    assert encoded not in rendered
    assert password not in rendered
    assert user not in rendered
    assert any("AUTH [credentials redacted]" in row["line"] for row in wire)
    assert any("[AUTH payload redacted]" in row["line"] for row in wire)
