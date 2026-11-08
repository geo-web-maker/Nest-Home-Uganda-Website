#!/usr/bin/env python3
"""Compare the Nest backend with its copy inside Multi-Site-Hosting (see SYNC_REQUIRED.md).

Usage: python scripts/check_nest_sync.py <nest backend/app dir> <multi projects/nest dir>
Differences in the import prefix (app. vs projects.nest.) are ignored.
"""
import sys
from pathlib import Path

SKIP = ("__pycache__", "/tests/", "/build/", ".pyc", "node_modules")
CHECKED = ("/core/", "/modules/")
CHECKED_FILES = {"/jobs.py", "/main.py", "/registry.py"}


def norm(text: str) -> str:
    return text.replace("projects.nest.", "app.").replace("projects.nest", "app")


def files(root: Path) -> dict[str, Path]:
    out = {}
    for p in root.rglob("*"):
        rel = "/" + p.relative_to(root).as_posix()
        if (p.is_file() and p.suffix == ".py" and not any(s in rel for s in SKIP)
                and (rel.startswith(CHECKED) or rel in CHECKED_FILES)):
            out[rel] = p
    return out


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    a, b = files(Path(sys.argv[1])), files(Path(sys.argv[2]))
    problems = []
    for rel in sorted(set(a) | set(b)):
        if rel not in a:
            problems.append(f"only in Multi-Site copy: {rel}")
        elif rel not in b:
            problems.append(f"only in Nest backend:   {rel}")
        elif norm(a[rel].read_text(errors="ignore")) != norm(b[rel].read_text(errors="ignore")):
            problems.append(f"DIFFERS:                {rel}")
    for line in problems:
        print(line)
    print(f"{len(problems)} problem(s)" if problems else "In sync.")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
