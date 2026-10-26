# Security and privacy incident runbook

This is an operational template, not legal advice. The data controller, privacy lead, lawyer and reporting deadlines must be confirmed by the owner before go-live.

## Immediate response

1. Protect people first. If a person may be in immediate danger, use the approved emergency procedure. The application does not replace emergency services.
2. Record the time the incident was discovered and who reported it: `client to supply`.
3. Notify the incident lead: `client to supply`.
4. Preserve relevant logs and evidence. Do not copy client records, photos, passwords, tokens, or medical details into chat, email, or the incident ticket.
5. Contain the incident using the smallest safe action: revoke the affected device/token, disable the affected feature, restrict access, or isolate the affected service. Record what was changed and by whom.
6. Do not delete evidence or run destructive database commands while investigating.

## Triage checklist

- [ ] Which system is affected: website, admin, nurse app, external MongoDB, Cloudinary, Firebase, SMS provider, or B2?
- [ ] What data categories may be involved? `client to supply`
- [ ] Is there evidence of unauthorised access, loss, alteration, disclosure, or service interruption?
- [ ] Which users/clients may be affected? Keep the list in the approved restricted incident register, not in this document.
- [ ] Are backups intact and can the system be restored safely?
- [ ] Are credentials, signing keys, refresh tokens, provider keys, or device registrations affected?

## Notification and legal review

- Data controller: `client to supply`
- Data protection officer/contact: `client to supply`
- Legal adviser: `client to supply`
- PDPO contact and reporting process: verify on the official PDPO portal before go-live.
- Notification decision, rationale, approver, and timestamps: `client to supply`

Do not invent a statutory deadline or send a notification before the responsible controller/legal adviser has reviewed the facts and applicable obligations.

## Recovery and closure

- [ ] Containment approved and recorded.
- [ ] Root cause and scope reviewed.
- [ ] Credentials rotated and sessions/devices revoked where appropriate.
- [ ] Recovery performed using `docs/RESTORE_RUNBOOK.md` if required.
- [ ] Affected people and regulators notified if required by the controller/legal adviser.
- [ ] Corrective actions have owners and due dates.
- [ ] Post-incident review completed; no personal or health data included in the general report.
