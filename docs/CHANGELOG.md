# Changelog

## 2026-10-25 - Owner-approved privacy warning and care data safeguards

- Added the exact public booking warning `Please do not enter medical details here` beside the short-note field. The existing contact-consent checkbox remains required.
- Added a dedicated regression test for the warning and consent requirement.
- Centralised Cloudinary upload signing and deletion in the backend photo-store helper.
- Added audited client data export and anonymisation endpoints, including client-specific consent records, and a Data and retention admin panel.
- Added an approved purge path for client-associated photo assets and free-text visit notes.
- Rejected idempotency keys reused by another nurse or visit and prevented batch sync from converting unexpected server errors into invalid-payload responses.
- Extended route-call drift scanning to include nurse PWA source and native authentication routes.

Validation: written, not run. CI and owner-controlled deployment checks have not yet been executed.
