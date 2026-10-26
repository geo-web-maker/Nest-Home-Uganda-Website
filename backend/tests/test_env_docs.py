from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_env_docs_exist_and_cover_backup_controls():
    text = (ROOT / "docs" / "ENV_VARS.md").read_text(encoding="utf-8")
    for key in ("B2_ENDPOINT", "B2_KEY", "B2_SECRET", "BACKUP_BUCKET", "BACKUP_PASSPHRASE"):
        assert key in text
