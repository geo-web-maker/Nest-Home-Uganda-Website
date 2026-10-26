from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_env_example_exists_and_has_no_real_secrets():
    path = ROOT / ".env.example"
    assert path.exists()
    text = path.read_text(encoding="utf-8")
    for forbidden in ("sk_live_", "-----BEGIN PRIVATE KEY-----", "mongodb+srv://user:password@"):
        assert forbidden not in text
