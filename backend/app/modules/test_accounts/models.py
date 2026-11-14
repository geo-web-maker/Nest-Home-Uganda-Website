from app.core.models import TimestampedDocument


class TestSandboxConfig(TimestampedDocument):
    """One document (key "main") holding the test-account master switch and delivery rules.

    `enabled` is the master switch: while false both test accounts are off and cannot sign in.
    `delivery` is "sink" (nothing leaves the system) or "allowlist" (email and SMS sent by a test
    account are really delivered, but only to the addresses and numbers listed here).
    """

    __test__ = False  # not a pytest class

    key: str = "main"
    enabled: bool = False
    delivery: str = "sink"
    emails: list[str] = []
    phones: list[str] = []

    class Settings:
        name = "test_sandbox_config"
