"""A function-level `import re` makes `re` local to the whole function, so an earlier
`re.match` raised UnboundLocalError on every SMTP send (Brevo over SMTP). Never again."""
import ast
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
# Works in both layouts: the Nest repo (backend/app/...) and the Multi-Site copy (projects/nest/...).
SRC = next(p for p in (_ROOT / "app" / "modules" / "mail" / "outbox.py", _ROOT / "modules" / "mail" / "outbox.py") if p.exists())


def test_no_function_shadows_a_module_level_import():
    tree = ast.parse(SRC.read_text())
    module_names = {
        (a.asname or a.name).split(".")[0]
        for n in tree.body if isinstance(n, (ast.Import, ast.ImportFrom)) for a in n.names
    }
    bad = []
    for fn in ast.walk(tree):
        if isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for n in ast.walk(fn):
                if isinstance(n, (ast.Import, ast.ImportFrom)):
                    for a in n.names:
                        name = (a.asname or a.name).split(".")[0]
                        if name in module_names:
                            bad.append(f"{fn.name}: {name} (line {n.lineno})")
    assert bad == []
