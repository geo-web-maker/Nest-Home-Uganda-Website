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
    # The test client (see client.py). `client_enabled` is kept across switch-offs so the client comes back with the
    # accounts; `day_offset` is how many days the test data has been moved on from real time.
    client_enabled: bool = False
    day_offset: int = 0
    scenario: str | None = None
    client_lat: float | None = None  # where the test client's home is, kept across resets
    client_lng: float | None = None
    client_radius_m: int | None = None
    client_patient_type: str | None = None

    class Settings:
        name = "test_sandbox_config"
