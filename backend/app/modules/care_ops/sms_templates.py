"""SMS copy is deliberately free of client names and clinical or health details."""

from string import Template

TEMPLATES = {
    "sos": Template(
        "Nest Home Care: a staff safety alert needs a response. Open the secure link: $url"
    ),
    "critical_alert": Template(
        "Nest Home Care: a critical staff alert needs a response. Open: $url"
    ),
    "warning_alert": Template("Nest Home Care: an unresolved staff alert needs review. Open: $url"),
    "safety_timer": Template("Nest Home Care: a staff safety timer needs review. Open: $url"),
}
BANNED_TERMS = ("diagnosis", "medication", "medical condition", "patient name", "clinical note")


def render_sms(name: str, url: str) -> str:
    if name not in TEMPLATES:
        raise KeyError(name)
    text = TEMPLATES[name].substitute(url=url)
    if len(text) > 160:
        raise ValueError("SMS exceeds the configured 160-character template budget")
    lowered = text.lower()
    if any(term in lowered for term in BANNED_TERMS):
        raise ValueError("SMS contains a prohibited health term")
    return text
