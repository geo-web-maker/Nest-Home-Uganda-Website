"""Editable mail settings catalogue (specification Section 5).

Values here are safe defaults only. Runtime resolution is database, then environment,
then this catalogue. Secret values are never included in API responses.
"""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class SettingDefinition:
    key: str
    group: str
    label: str
    help: str
    kind: str
    default: Any
    secret: bool = False
    choices: tuple[str, ...] = ()
    minimum: int | float | None = None
    maximum: int | float | None = None


def _s(
    key: str,
    group: str,
    label: str,
    help: str,
    kind: str,
    default: Any,
    *,
    secret: bool = False,
    choices: tuple[str, ...] = (),
    minimum: int | float | None = None,
    maximum: int | float | None = None,
) -> SettingDefinition:
    return SettingDefinition(
        key, group, label, help, kind, default, secret, choices, minimum, maximum
    )


DEFINITIONS: tuple[SettingDefinition, ...] = (
    # 5.1 General
    _s(
        "mail.enabled", "general", "Enable mail",
        "Enables the mail module for permitted users.", "boolean", False
    ),
    _s(
        "mail.domain", "general", "Mail domain",
        "Root domain used for internal mailbox addresses. Required before mailbox creation.",
        "string", ""
    ),
    _s(
        "mail.address_pattern", "general", "Address pattern",
        "Tokens: {first}, {last}, {staff_no}. Collisions receive a number suffix.",
        "string", "{first}.{last}"
    ),
    _s(
        "mail.accepted_domains", "general", "Accepted domains",
        "Additional domains whose recipients are treated as local.", "list", []
    ),
    # 5.2 Sending
    _s(
        "mail.provider", "sending", "Outbound provider",
        "Provider used for external messages.", "choice", "console",
        choices=("console", "resend", "brevo")
    ),
    _s(
        "mail.provider_api_key", "sending", "Provider API key",
        "Write-only provider credential. Stored encrypted.", "secret", None, secret=True
    ),
    _s(
        "mail.brevo_transport", "sending", "Brevo transport",
        "SMTP preserves message headers, inline images and original filenames; API is the fallback.",
        "choice", "smtp", choices=("smtp", "api")
    ),
    _s("mail.smtp_host", "sending", "SMTP host", "Brevo SMTP relay host.", "string", "smtp-relay.brevo.com"),
    _s("mail.smtp_port", "sending", "SMTP port", "Use 2525 if the host blocks 587; 465 uses implicit TLS.", "integer", 587, minimum=1, maximum=65535),
    _s("mail.smtp_username", "sending", "SMTP username", "Brevo SMTP login (not the API key).", "string", ""),
    _s("mail.smtp_password", "sending", "SMTP password", "Write-only Brevo SMTP key (not the API key).", "secret", None, secret=True),
    _s(
        "mail.provider_webhook_secret", "sending", "Provider webhook authentication",
        "Write-only Resend Svix secret or Brevo basic-auth password (configure the webhook URL with username and password). Stored encrypted.", "secret", None, secret=True
    ),
    _s(
        "mail.from_name", "sending", "System sender name",
        "Display name for system-generated email.", "string", "Bloomwell Home Care Uganda"
    ),
    _s(
        "mail.reply_to", "sending", "Reply-to address",
        "Optional reply-to address for system mail.", "string", ""
    ),
    _s(
        "mail.external_enabled", "sending", "External sending enabled",
        "Keep off until provider, attachment, Bcc and delivery-event acceptance checks pass.", "boolean", False
    ),
    _s(
        "mail.provider_daily_limit", "sending", "Provider daily recipient limit",
        "Maximum external recipients per provider per UTC day.", "integer", 100,
        minimum=1, maximum=1_000_000
    ),
    _s(
        "mail.provider_monthly_limit", "sending", "Provider monthly recipient limit",
        "Maximum external recipients per provider per UTC month.", "integer", 3000,
        minimum=1, maximum=10_000_000
    ),
    _s(
        "mail.mailbox_daily_external_limit", "sending", "Mailbox daily external limit",
        "Maximum external recipients sent by one mailbox per day.", "integer", 500,
        minimum=1, maximum=100_000
    ),
    _s(
        "mail.contacts_suggestion_limit", "sending", "Address suggestions shown",
        "How many suggestions the To, Cc and Bcc fields show at once.", "integer", 8,
        minimum=1, maximum=25
    ),
    _s(
        "mail.contacts_directory_enabled", "sending", "Suggest in-house mailboxes",
        "Let the To, Cc and Bcc fields suggest open in-house mailboxes by name or address as people type.",
        "boolean", True
    ),
    _s(
        "mail.push_enabled", "general", "Browser notifications",
        "Send a notification to the admin app (installed PWA or open browser) when new mail arrives. Needs the VAPID keys below.",
        "boolean", False
    ),
    _s(
        "mail.push_vapid_public", "general", "Push public key (VAPID)",
        "Public key from scripts/gen_vapid_keys.py. Shared with browsers.", "string", ""
    ),
    _s(
        "mail.push_vapid_private", "general", "Push private key (VAPID)",
        "Write-only private key from scripts/gen_vapid_keys.py. Stored encrypted.", "secret", None, secret=True
    ),
    _s(
        "mail.push_subject", "general", "Push contact",
        "A mailto: or https: address that push services can contact, for example mailto:info@yourdomain.", "string", ""
    ),
    _s(
        "mail.push_show_preview", "general", "Show sender and subject in notifications",
        "Off by default: notifications say only that a message arrived, so no client details show on a lock screen.",
        "boolean", False
    ),
    _s(
        "mail.message_recipient_limit", "sending", "Recipients per message",
        "Maximum total To, Cc and Bcc recipients.", "integer", 100,
        minimum=1, maximum=1000
    ),
    _s(
        "mail.warn_threshold_percent", "sending", "Usage warning threshold",
        "Usage percentage that alerts superadmins.", "integer", 80,
        minimum=1, maximum=100
    ),
    _s(
        "mail.send_rate_per_second", "sending", "Provider send rate",
        "Maximum paced provider sends per second.", "number", 2,
        minimum=0.1, maximum=100
    ),
    _s(
        "mail.suspend_all_sending", "sending", "Suspend all sending",
        "Emergency stop for outbound sending.", "boolean", False
    ),
    # 5.3 Storage
    _s(
        "mail.mailbox_quota_mb", "storage", "Mailbox quota (MB)",
        "Per-mailbox quota including message copies and attachments.", "integer", 1024,
        minimum=1, maximum=1_048_576
    ),
    _s(
        "mail.max_message_mb", "storage", "Maximum message size (MB)",
        "Message and attachments combined; Cloudflare inbound hard ceiling is 25 MB.",
        "integer", 20, minimum=1, maximum=25
    ),
    _s(
        "mail.max_attachment_mb", "storage", "Maximum attachment size (MB)",
        "Maximum size allowed for one uploaded attachment.", "integer", 15,
        minimum=1, maximum=25
    ),
    _s(
        "mail.blocked_extensions", "storage", "Blocked attachment extensions",
        "Comma-separated file extensions that cannot be uploaded or downloaded.",
        "string", "exe,js,jar,scr,bat,cmd,com,msi,vbs,iso,dll,ps1,lnk,docm,xlsm,pptm"
    ),
    _s(
        "mail.trash_purge_days", "storage", "Trash purge days",
        "Age after which Trash items may be purged.", "integer", 30,
        minimum=1, maximum=3650
    ),
    _s(
        "mail.spam_purge_days", "storage", "Spam purge days",
        "Age after which Spam items may be purged.", "integer", 30,
        minimum=1, maximum=3650
    ),
    # 5.4 Retention
    _s(
        "mail.retention_years", "retention", "Closed mailbox retention (years)",
        "Zero means closed mailboxes are retained indefinitely.", "integer", 0,
        minimum=0, maximum=100
    ),
    _s(
        "mail.purge_enabled", "retention", "Enable retention purge",
        "Safety lock. No closed mailbox is purged unless this is enabled.", "boolean", False
    ),
    # 5.5 Inbound and spam
    _s(
        "mail.inbound_enabled", "inbound", "Accept inbound external mail",
        "Enables external inbound delivery after Cloudflare is configured.", "boolean", False
    ),
    _s(
        "mail.inbound_webhook_secret", "inbound", "Inbound webhook secret",
        "Write-only HMAC secret shared with the Cloudflare Email Worker.",
        "secret", None, secret=True
    ),
    _s(
        "mail.spam_score_threshold", "inbound", "Spam score threshold",
        "Messages at or above this score are moved to Spam.", "number", 5.0,
        minimum=0, maximum=100
    ),
    _s(
        "mail.quarantine_dmarc_fail", "inbound", "Quarantine DMARC failures",
        "Move messages that fail DMARC into Spam.", "boolean", True
    ),
    _s(
        "mail.external_sender_banner", "inbound", "Show external sender banner",
        "Display a warning for messages from outside accepted domains.", "boolean", True
    ),
    _s(
        "mail.block_remote_images", "inbound", "Block remote images",
        "Block remote images until a user allows them for a message.", "boolean", True
    ),
    _s(
        "mail.confirm_external_links", "inbound", "Confirm external mail links",
        "Ask before opening links from external mail.", "boolean", True
    ),
    # 5.6 Rich content controls
    _s(
        "mail.rich_text_enabled", "general", "Enable rich-text mail",
        "Off keeps the compose editor in plain-text mode.", "boolean", True
    ),
    _s(
        "mail.max_html_kb", "storage", "Maximum HTML body (KB)",
        "Largest HTML body retained before safe truncation with a visible note.",
        "integer", 1024, minimum=1, maximum=2000
    ),
    _s(
        "mail.inline_image_max_kb", "storage", "Maximum inline image (KB)",
        "Largest inline image returned directly in a message view.",
        "integer", 1024, minimum=1, maximum=4096
    ),
    _s(
        "mail.inline_images_total_mb", "storage", "Inline images per message (MB)",
        "Maximum combined inline image bytes returned for one message view.",
        "integer", 5, minimum=1, maximum=50
    ),
    _s("mail.scan_enabled", "security", "Enable attachment scanning", "Off until the private ClamAV service is deployed and verified.", "boolean", False),
    _s("mail.scan_mode", "security", "Scanner mode", "Use the authenticated HTTPS sidecar in production.", "choice", "http", choices=("http", "clamd")),
    _s("mail.scan_url", "security", "Scanner HTTPS URL", "Private HTTPS URL for the ClamAV sidecar.", "string", ""),
    _s("mail.clamd_host", "security", "Local clamd host", "Development only; never expose this port publicly.", "string", "127.0.0.1"),
    _s("mail.clamd_port", "security", "Local clamd port", "Development-only ClamAV TCP port.", "integer", 3310, minimum=1, maximum=65535),
    _s("mail.scan_token", "security", "Scanner bearer token", "Write-only token shared with the scanner sidecar.", "secret", None, secret=True),
    _s("mail.scan_timeout_seconds", "security", "Scanner timeout (seconds)", "Maximum time for an attachment scan.", "integer", 60, minimum=1, maximum=300),
    _s("mail.scan_fail_mode", "security", "Scanner failure mode", "Allow keeps the file unscanned; block prevents use until a clean result. Block is the safe default for contract workflows.", "choice", "block", choices=("allow", "block")),
    _s("mail.scan_block_unscanned_download", "security", "Block unscanned downloads", "Require a clean verdict before attachment downloads.", "boolean", True),
    _s(
        "mail.store_sent_eml", "storage", "Store sent EML copies",
        "Keep the RFC 5322 message bytes generated at send time.", "boolean", True
    ),
    _s(
        "mail.provider_max_message_mb", "sending", "Provider message limit (MB)",
        "Conservative external message limit including encoded attachment overhead; verify against provider documentation.",
        "integer", 20, minimum=1, maximum=25
    ),
    _s(
        "mail.confirm_external_send", "sending", "Confirm external sends",
        "Show a recipient summary before sending to external addresses.", "boolean", True
    ),
    _s(
        "mail.allow_forward_as_attachment", "general", "Allow forward as attachment",
        "Offer forwarding the original message as a byte-preserved .eml attachment.", "boolean", True
    ),
    # 5.6 Backfill
    _s(
        "mail.backfill_include_inactive", "backfill", "Include inactive users",
        "Create mailboxes for inactive users during backfill.", "boolean", False
    ),
    # 5.7 Backups (values are informational; owner-run scripts use environment variables)
    _s(
        "mail.backup_endpoint", "backups", "Backblaze B2 endpoint",
        "Informational endpoint for the owner-run backup scripts.", "string", ""
    ),
    _s(
        "mail.backup_bucket", "backups", "Backblaze B2 dump bucket",
        "Bucket used for encrypted Postgres dump artifacts.", "string", ""
    ),
    _s(
        "mail.backup_attachments_bucket", "backups", "Backblaze B2 attachments bucket",
        "Second-copy bucket for R2 mail attachments.", "string", ""
    ),
    _s(
        "mail.backup_key_id", "backups", "Backblaze application key ID",
        "Write-only B2 credential. Stored encrypted.", "secret", None, secret=True
    ),
    _s(
        "mail.backup_application_key", "backups", "Backblaze application key",
        "Write-only B2 credential. Stored encrypted.", "secret", None, secret=True
    ),
    _s(
        "mail.backup_retention_days", "backups", "Backup retention (days)",
        "Informational. Configure actual retention and Object Lock in B2.", "integer", 90,
        minimum=1, maximum=36_500
    ),
    # 5.8 Security
    _s(
        "mail.require_totp_for_scopes", "security", "Scopes requiring TOTP",
        "Comma-separated sensitive scopes that will require authenticator-app verification.",
        "string", "mail:shared:manage,mail:archive:read,mail:settings:manage"
    ),
    _s(
        "mail.new_external_send_review", "security", "Review first external send",
        "Optionally hold the first external send from a new mailbox for approval.",
        "boolean", False
    ),
)

BY_KEY: dict[str, SettingDefinition] = {item.key: item for item in DEFINITIONS}
