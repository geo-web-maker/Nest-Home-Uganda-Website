"""Postgres cannot infer the type of a bare $n inside jsonb_build_object (a variadic "any" argument), so the
statement fails with "could not determine data type of parameter" and the endpoint answers 500.
Attachment download, original download and spam report hit this. Every such parameter must be cast."""

import re
from pathlib import Path

APP = Path(__file__).resolve().parents[1] / "app"
BARE = re.compile(r"\$\d+(?!\s*::)")


def test_jsonb_build_object_parameters_are_cast():
    bad = []
    for path in APP.rglob("*.py"):
        text = path.read_text(errors="ignore")
        for call in re.finditer(r"jsonb_build_object\(", text):
            depth, i = 1, call.end()
            while i < len(text) and depth:
                depth += {"(": 1, ")": -1}.get(text[i], 0)
                i += 1
            body = text[call.end() : i - 1]
            for m in BARE.finditer(body):
                if not body[m.end() : m.end() + 2] == "::":
                    bad.append(f"{path.relative_to(APP)}: {body.strip()[:80]}")
    assert not bad, "uncast parameter in jsonb_build_object:\n" + "\n".join(sorted(set(bad)))
