import ast
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1] / "app" / "modules"
EXPECTED = ("visit_events", "visit_notes", "sos_events", "care_logs", "audit")


@pytest.mark.parametrize("module_name", EXPECTED)
def test_append_only_repositories_have_no_mutating_helpers(module_name):
    module = ROOT / module_name
    if not module.exists():
        pytest.skip(f"{module_name} is introduced by a later work order")
    repository = module / "repository.py"
    if not repository.exists():
        pytest.skip(f"{module_name} repository is not introduced yet")
    tree = ast.parse(repository.read_text(encoding="utf-8"))
    forbidden = ("update", "delete", "remove", "replace")
    found = [
        node.name
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name.lower().startswith(forbidden)
    ]
    assert not found, f"{module_name} must be append-only: {found}"


def test_expected_append_only_module_list_is_not_empty():
    assert EXPECTED


def test_append_only_mutations_are_confined_to_named_retention_purge_functions():
    retention = ROOT / "care_retention" / "retention.py"
    if not retention.exists():
        pytest.skip("care retention module is introduced by a later work order")
    tree = ast.parse(retention.read_text(encoding="utf-8"))
    functions = [
        node.name
        for node in ast.walk(tree)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
    ]
    purge_functions = [name for name in functions if name.startswith("purge_")]
    assert set(purge_functions) == {
        "purge_photo_for_data_request",
        "purge_notes_for_data_request",
        "purge_coordinates",
        "purge_sos_locations",
        "purge_expired_photos",
        "purge_abandoned_photo_uploads",
    }
