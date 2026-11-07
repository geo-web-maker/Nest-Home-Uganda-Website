from __future__ import annotations

import html
import re
from dataclasses import dataclass
from typing import Any, Literal
from urllib.parse import urlsplit

from app.core.config import get_settings
from app.modules.agreements.models import AgreementMessageTemplate
from app.modules.agreements import rules

ALLOWED_VARIABLES = frozenset({
    "client_name", "client_first_name", "reference", "link", "code", "expires_days",
    "expires_date", "company", "support_phone", "support_email", "staff_name", "reason",
})
LINK_REQUIRED = frozenset({"agreement_sent", "reminder_1", "reminder_2", "expiring_soon", "staff_revised", "completed_client", "amendment_sent"})
CODE_REQUIRED = frozenset({"otp_sign", "otp_view"})

GSM_BASIC = frozenset(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
)
GSM_EXTENDED = frozenset("^{}\\[~]|€")
VAR_RE = re.compile(r"{{\s*([a-z_]+)\s*}}")


@dataclass(frozen=True)
class DefaultMessage:
    subject: str = ""
    preheader: str = ""
    body: str = ""
    button: str = ""
    footer_note: str = ""


# Copy from the implementation plan. No clinical, patient or fee fields are available here.
DEFAULTS: dict[tuple[str, str], DefaultMessage] = {
    ("agreement_sent", "email"): DefaultMessage(
        "Your Bloomwell care agreement is ready to review",
        "Review it and sign online in a few minutes.",
        "Hello {{client_name}}, thank you for choosing Bloomwell Home Care Uganda. Your care agreement (reference {{reference}}) is ready. You can read it, complete the remaining sections and sign online from your phone. Nothing to download or print. The link works for {{expires_days}} days. If you have any questions, call us on {{support_phone}} before you sign.",
        "Review and sign", "We will first send a short code to this phone number or email to confirm it is you.",
    ),
    ("agreement_sent", "sms"): DefaultMessage(body="Bloomwell: Hello {{client_first_name}}, your care agreement is ready to review and sign online: {{link}} Questions? {{support_phone}}"),
    ("otp_sign", "email"): DefaultMessage("Your Bloomwell verification code", body="Your code is {{code}}. It expires in 10 minutes. Bloomwell staff will never ask you for this code."),
    ("otp_sign", "sms"): DefaultMessage(body="Bloomwell: Your verification code is {{code}}. Valid 10 minutes. Do not share it with anyone."),
    ("otp_view", "email"): DefaultMessage("Your Bloomwell verification code", body="Your code is {{code}}. It expires in 10 minutes. You asked to view your signed care agreement. Bloomwell staff will never ask you for this code."),
    ("otp_view", "sms"): DefaultMessage(body="Bloomwell: Your verification code is {{code}}. Valid 10 minutes. Do not share it with anyone."),
    ("reminder_1", "email"): DefaultMessage("A reminder: your Bloomwell care agreement is waiting", "It only takes a few minutes to complete.", "Hello {{client_first_name}}, your care agreement ({{reference}}) has not been signed yet. You can continue where you stopped. The link is valid until {{expires_date}}.", "Continue"),
    ("reminder_1", "sms"): DefaultMessage(body="Bloomwell: Reminder to review and sign your care agreement: {{link}} Valid until {{expires_date}}. {{support_phone}}"),
    ("reminder_2", "email"): DefaultMessage("Your Bloomwell care agreement still needs your signature", body="Hello {{client_first_name}}, we have not yet received your signature on agreement {{reference}}. If anything is unclear, or you would like us to go through it with you, call {{support_phone}} and a team member will help.", button="Review and sign"),
    ("reminder_2", "sms"): DefaultMessage(body="Bloomwell: Your care agreement still needs your signature: {{link}} Need help? Call {{support_phone}}"),
    ("expiring_soon", "email"): DefaultMessage("Your care agreement link expires on {{expires_date}}", body="Hello {{client_first_name}}, the link for agreement {{reference}} expires on {{expires_date}}. After that we will need to send you a new one."),
    ("expiring_soon", "sms"): DefaultMessage(body="Bloomwell: Your agreement link expires {{expires_date}}: {{link}} Call {{support_phone}} if you need more time."),
    ("expired", "email"): DefaultMessage("Your care agreement link has expired", body="Hello {{client_first_name}}, the link for agreement {{reference}} is no longer active. Nothing has been signed. Call {{support_phone}} or reply to this email and we will send a new one."),
    ("changes_requested", "email"): DefaultMessage("Change requested on agreement {{reference}}", body="A client has requested a change to agreement {{reference}}. Open the secure admin workspace to review the note.", button="Open agreement"),
    ("staff_revised", "email"): DefaultMessage("Your care agreement was updated, please review again", "A few details changed since you last looked.", "Hello {{client_first_name}}, we updated your care agreement ({{reference}}). The changes are highlighted so you can check them before signing. Your earlier link no longer works; please use the new one.", "Review the changes"),
    ("staff_revised", "sms"): DefaultMessage(body="Bloomwell: We updated your care agreement. Please review the changes: {{link}} Call {{support_phone}} with questions."),
    ("client_signed_client", "email"): DefaultMessage("Thank you, we received your signature", "Bloomwell will now countersign.", "Hello {{client_first_name}}, we received your signature on agreement {{reference}}. A Bloomwell representative will countersign shortly. We will send you a secure link as soon as the agreement is complete."),
    ("client_signed_client", "sms"): DefaultMessage(body="Bloomwell: Thank you, we received your signed agreement. We will confirm when it is countersigned. {{support_phone}}"),
    ("client_signed_staff", "email"): DefaultMessage("{{client_name}} signed agreement {{reference}}", body="The client has signed. Review and countersign when ready.", button="Countersign"),
    ("completed_client", "email"): DefaultMessage("Your Bloomwell care agreement is complete", "Both signatures are in place.", "Hello {{client_first_name}}, agreement {{reference}} is now signed by both parties and complete. You can view it online whenever you need it. For your privacy we will send a code each time you open it. If you have questions about your care or payments, call {{support_phone}} or write to {{support_email}}.", "View my agreement"),
    ("completed_client", "sms"): DefaultMessage(body="Bloomwell: Your care agreement is complete and signed by both parties. View it any time: {{link}} {{support_phone}}"),
    ("completed_staff", "email"): DefaultMessage("Agreement {{reference}} is complete", body="Agreement {{reference}} has been countersigned and sealed."),
    ("voided", "email"): DefaultMessage("Your care agreement {{reference}} has been cancelled", body="Hello {{client_first_name}}, agreement {{reference}} has been cancelled and is no longer in effect. If this is unexpected, please call {{support_phone}}."),
    ("voided", "sms"): DefaultMessage(body="Bloomwell: Agreement {{reference}} has been cancelled. Questions? Call {{support_phone}}."),
    ("amendment_sent", "email"): DefaultMessage("A change to your care agreement needs your approval", body="Hello {{client_first_name}}, we have prepared an amendment to agreement {{reference}}. It names the clause being changed. Please review and sign online.", button="Review the amendment"),
    ("amendment_sent", "sms"): DefaultMessage(body="Bloomwell: An amendment to your care agreement needs your approval: {{link}} {{support_phone}}"),
    ("payment_due", "email"): DefaultMessage("Reminder: advance payment for your care", body="Hello {{client_first_name}}, the advance payment under agreement {{reference}} is due on {{expires_date}}. Payment details are in your agreement. We never ask you to pay to any account that is not listed there. If anything looks different, call {{support_phone}} first."),
    ("payment_due", "sms"): DefaultMessage(body="Bloomwell: Advance payment is due {{expires_date}}. Use only the payment details in your agreement. Questions: {{support_phone}}"),
}


def validate_template(stage_key: str, channel: Literal["email", "sms"], value: dict[str, str]) -> None:
    text = "\n".join(value.values())
    found = set(VAR_RE.findall(text))
    invalid = found - ALLOWED_VARIABLES
    if invalid:
        raise ValueError(f"Unknown message variable(s): {', '.join(sorted(invalid))}")
    stripped = VAR_RE.sub("", text)
    if "{{" in stripped or "}}" in stripped:
        raise ValueError("Message contains a malformed template variable")
    subject = value.get("subject", "")
    if "\r" in subject or "\n" in subject:
        raise ValueError("Email subject must be a single line")
    # Email links are a protected layout element (button + copyable URL), not free-text
    # content. SMS has no shared layout, so its template must explicitly contain the link.
    if stage_key in LINK_REQUIRED and channel == "sms" and "link" not in found:
        raise ValueError("This message must include {{link}}")
    if stage_key in CODE_REQUIRED and "code" not in found:
        raise ValueError("Verification messages must include {{code}}")
    if channel == "sms":
        if not value.get("body", "").startswith("Bloomwell:"):
            raise ValueError("SMS messages must start with 'Bloomwell:'")
        body = value.get("body", "")
        if not is_gsm7(body):
            raise ValueError("SMS must contain GSM-7 characters only")
        if sms_segments(body) > 2:
            raise ValueError("SMS may not exceed two segments (306 GSM-7 characters)")


def is_gsm7(value: str) -> bool:
    return all(char in GSM_BASIC or char in GSM_EXTENDED for char in value)


def gsm7_units(value: str) -> int:
    return sum(2 if char in GSM_EXTENDED else 1 for char in value)


def sms_segments(value: str) -> int:
    units = gsm7_units(value)
    return 1 if units <= 160 else (units + 152) // 153



def validate_rendered_sms(body: str) -> None:
    """Enforce the GSM-7 two-segment ceiling after variable expansion."""
    if not body.startswith("Bloomwell:"):
        raise ValueError("SMS messages must start with 'Bloomwell:'")
    if not is_gsm7(body):
        raise ValueError("Rendered SMS contains characters outside GSM-7")
    if sms_segments(body) > 2:
        raise ValueError("Rendered SMS exceeds two segments (306 GSM-7 characters)")


def render_variables(text: str, variables: dict[str, Any]) -> str:
    found = set(VAR_RE.findall(text))
    if found - ALLOWED_VARIABLES:
        raise ValueError("Message contains an unknown variable")
    for name in found:
        if name not in variables:
            raise ValueError(f"Missing message value: {name}")
    return VAR_RE.sub(lambda m: str(variables[m.group(1)]), text)


async def get_template(stage_key: str, channel: Literal["email", "sms"]) -> tuple[DefaultMessage, int, bool]:
    override = await AgreementMessageTemplate.find_one(
        AgreementMessageTemplate.stage_key == stage_key,
        AgreementMessageTemplate.channel == channel,
        AgreementMessageTemplate.locale == "en",
    )
    if override:
        return DefaultMessage(override.subject, override.preheader, override.body, override.button, override.footer_note), override.version, False
    default = DEFAULTS.get((stage_key, channel))
    if default is None:
        raise ValueError("No default message exists for this stage and channel")
    return default, 1, True


def message_variables(agreement: Any, *, link: str = "", code: str = "", expires_days: int = 14,
                      expires_date: str = "", staff_name: str = "", reason: str = "") -> dict[str, str]:
    client_field = agreement.fields.get(rules.field_key("client.name"))
    client_name = str(client_field.value or "there") if client_field else "there"
    return {
        "client_name": client_name,
        "client_first_name": client_name.split()[0] if client_name else "there",
        "reference": agreement.reference,
        "link": link,
        "code": code,
        "expires_days": str(expires_days),
        "expires_date": expires_date,
        "company": "Bloomwell Home Care Uganda Limited",
        "support_phone": "0787499988",
        "support_email": "info@bhcug.com",
        "staff_name": staff_name,
        "reason": reason,
    }


def render_email(stage_key: str, template: DefaultMessage, variables: dict[str, str]) -> tuple[str, str, str]:
    subject = render_variables(template.subject, variables)
    preheader = render_variables(template.preheader, variables)
    body = render_variables(template.body, variables)
    button = render_variables(template.button, variables)
    note = render_variables(template.footer_note, variables)
    escaped_body = "".join(f"<p style=\"margin:0 0 16px;color:#123524;line-height:1.6;font-size:16px\">{html.escape(line)}</p>" for line in body.split("\n") if line)
    raw_link = variables.get("link", "")
    if stage_key in LINK_REQUIRED and not raw_link:
        raise ValueError("This email stage requires a secure agreement link")
    if raw_link:
        validate_link_url(raw_link)
    link = html.escape(raw_link, quote=True)
    button_html = (
        f'<a href="{link}" style="display:inline-block;padding:14px 22px;min-height:44px;box-sizing:border-box;background:#18784D;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;border-bottom:3px solid #C79A3B">{html.escape(button)}</a>'
        if button and link else ""
    )
    copy_link = f'<p style="margin:18px 0 0;font-size:13px;color:#4A6354">Or copy this link: <a href="{link}" style="color:#18784D;word-break:break-all">{link}</a></p>' if link else ""
    note_html = f'<p style="font-size:13px;color:#4A6354;margin:0 0 20px;padding:10px 14px;background:#F8F3E1;border-left:3px solid #C79A3B">{html.escape(note)}</p>' if note else ""
    preheader_html = f'<div style="display:none;font-size:1px;color:#F3F8F1;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">{html.escape(preheader)}</div>'
    body_html = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 8px;background:#F3F8F1;font-family:Arial,Helvetica,sans-serif">
{preheader_html}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-collapse:separate;border:1px solid #CBD8C6;border-radius:12px;overflow:hidden">
<tr><td style="height:5px;line-height:5px;font-size:0;background:#C79A3B">&nbsp;</td></tr>
<tr><td style="padding:24px 28px;background:#123524;color:#F4F1DF;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;letter-spacing:.02em">Bloomwell <span style="color:#E3BB62">Home Care</span></td></tr>
<tr><td style="padding:30px 28px">{escaped_body}{note_html}{button_html}{copy_link}</td></tr>
<tr><td style="padding:20px 28px;background:#F8F3E1;border-top:1px solid #E9DDB8;color:#4A6354;font-size:12px;line-height:1.6">Bloomwell Home Care Uganda Limited · Kampala, Uganda<br><a href="mailto:info@bhcug.com" style="color:#18784D">info@bhcug.com</a> · 0787499988<br>You received this because a care agreement was prepared for you.<br>Bloomwell will never ask for payment or passwords by email or SMS.</td></tr>
</table></td></tr></table></body></html>'''
    plain = body
    if link:
        plain += f"\n\n{button or 'Review online'}: {variables.get('link', '')}"
    plain += "\n\nBloomwell Home Care Uganda Limited\nKampala, Uganda\ninfo@bhcug.com · 0787499988\nBloomwell will never ask for payment or passwords by email or SMS."
    return subject, body_html, plain


def validate_link_url(url: str) -> None:
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname != "bhcug.com" or parsed.port not in (None, 443) or parsed.username or parsed.password:
        raise ValueError("Agreement links must use https://bhcug.com")


def public_link(token: str) -> str:
    # New stable codes are 16 characters and use the short /a/ form; older random tokens
    # keep the long /agreement/ form so links already in inboxes still work.
    if len(token) == 16:
        grouped = "-".join(token[i:i + 4] for i in range(0, 16, 4))
        url = f"https://bhcug.com/a/{grouped}"
    else:
        url = f"https://bhcug.com/agreement/{token}"
    validate_link_url(url)
    return url
