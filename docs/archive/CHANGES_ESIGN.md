# E-signature hardening
1. Explicit "I agree to sign electronically" checkbox (required by the API; wording and version stored with the signature).
2. Sealed PDF attached to the client's completion email (set AGREEMENT_EMAIL_ATTACH_PDF=false to switch off). If attaching fails, the email still goes out with its secure link.
3. Signature record and certificate now include plain IP, user agent, signer email/phone, code-verified time, link generation and token-hash prefix.
4. Optional dedicated signed bucket with Object Lock retention (see docs/AGREEMENT_SIGNED_STORAGE.md).
Files: core/config.py, core/storage.py, modules/mail/providers.py, modules/agreements/{models,schemas,service,render,messages,diagnostics}.py, AgreementPublicPage.tsx(+css), tests/test_agreements_esign_storage.py.

# Practice agreements and sync note
5. "New practice agreement" (see PRACTICE_AGREEMENTS.md): full flow, TEST- numbers, hidden from the real list, never locked, deletable at any status, auto-deleted after AGREEMENT_PRACTICE_RETENTION_DAYS.
6. SYNC_REQUIRED.md + scripts/check_nest_sync.py: the Nest backend and the Multi-Site copy must always match (only the import prefix may differ).
