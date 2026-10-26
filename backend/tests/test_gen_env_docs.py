import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.gen_env_docs import outputs


def test_generator_is_stable_and_lists_every_registry_key():
    first = outputs()
    second = outputs()
    assert first == second
    assert "# BEGIN CARE SETTINGS" in first[0]
    assert "# END CARE SETTINGS" in first[0]
    assert "CARE_PRIVACY_NOTICE_TEXT" in first[0]
