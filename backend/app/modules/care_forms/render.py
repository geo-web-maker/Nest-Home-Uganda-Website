"""Renders care-form and tracker templates to PDF with WeasyPrint, the same way billing/render.py and agreements/render.py do.

Needs `jinja2` (add to the backend requirements) and `weasyprint` (already used). Templates live in ../templates.
"""
from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader

TEMPLATES = Path(__file__).resolve().parent / "templates"
_env = Environment(loader=FileSystemLoader(TEMPLATES), autoescape=True, trim_blocks=False)  # autoescape: values are user text
FORM_IDS = tuple(f"{i:02d}" for i in range(1, 13))


def template_for(form_id: str, patient_type: str | None = None) -> str:
    if form_id in FORM_IDS:
        return f"form-{form_id}.html.j2"
    if form_id == "tracker":
        if patient_type not in ("Mama", "Baby"):
            raise ValueError("Daily trackers are only for patients set as Mama or Baby by admin.")
        return f"tracker-{patient_type.lower()}.html.j2"
    raise ValueError(f"Unknown form: {form_id}")


def render_html(template_name: str, context: dict[str, Any]) -> str:
    return _env.get_template(template_name).render(**context)


def content_hash(markup: str) -> str:
    """Printed in the signature evidence line, so a signature is tied to this exact document."""
    return hashlib.sha256(markup.encode("utf-8")).hexdigest()


def render_pdf(template_name: str, context: dict[str, Any]) -> tuple[bytes, str]:
    from weasyprint import HTML  # lazy import, as in billing/render.py

    markup = render_html(template_name, context)
    return HTML(string=markup, base_url="https://bhcug.com/").write_pdf(), content_hash(markup)
