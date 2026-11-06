# Bloomwell online agreements — operator, deployment and test guide

This guide applies to both the standalone Nest Home Uganda site (`backend/app`) and the multi-site hoster's mirrored Nest project (`projects/nest`). The source agreement PDF is included under `backend/docs/legal_sources/` or `projects/nest/docs/legal_sources/` in the corresponding archive.

## 1. Legal source and template version

The published source map contains the text extracted from the 14-page owner-supplied **Client Home Nursing Service Agreement — Bloomwell Home Care Uganda Limited**, including clauses 1.0–15.5 and Schedules A, B and C. The only wording substitutions made are the two corrections expressly required by the implementation plan:

- Clause 1.1: `info@bhcug.com` replaces `info@wellnesthomecareug.com`.
- Clause 14.1: `info@bhcug.com` replaces `info@wellnesthomecareug.com`.

The phone formats remain as printed in the source: `0787499988` and `+256787499988`. Clause numbering, cross-references, and source wording (including source typographical issues) are not silently rewritten. The extracted source text is in `modules/agreements/source_template.py`; the original PDF is retained alongside the backend documentation for owner/legal comparison.

The seed operation is idempotent. On a new database it publishes the source template. If the database already has a different published template, it saves the source PDF text as a new **unpublished draft** rather than replacing live wording. In that case, an authorized owner must compare the draft with the PDF, then publish it from **Admin → Care operations → Agreements → Template versions**. Publishing is protected by the existing authenticator/TOTP session. Published versions are immutable; later wording changes must create a new version.

Do not send an agreement until a source-backed template is published. The server rejects a template missing any required clause heading or schedule, and checks both corrected email addresses.

## 2. Deployment prerequisites

Use the infrastructure already present in the relevant deployment:

- MongoDB/Beanie and the agreement document models registered in `registry.py`.
- Existing mail provider and settings in the Mail section.
- MamboSMS notification provider, sender ID, daily limits and SMS log.
- Existing R2/S3-compatible private storage configured for `Bucket.PRIVATE`.
- Existing TOTP guard and audit service.
- Scheduler enabled for reminder/expiry processing.

The backend image needs WeasyPrint and its native Pango/Cairo/Harfbuzz libraries. The provided backend Dockerfile includes the system packages; verify the actual deployed base image and build logs. Private object storage must not be publicly readable. Raw R2 object URLs are not exposed by the agreement API.

Configure at least one **real external delivery channel** before any client send:

- Email: Mail must be enabled, external sending enabled, not globally suspended, provider set to Resend or Brevo (not console), configured domain exactly `bhcug.com`, and valid provider API key or Brevo SMTP credentials.
- SMS: `NEST_SMS_PROVIDER=mambosms`, `NEST_MAMBOSMS_API_KEY` and a valid `NEST_SMS_SENDER_ID` (1–11 characters) must be configured. Existing Uganda mobile validation and daily limits apply.
- Agreement messages use `https://bhcug.com` only. Configure the website and routing so `/agreement/:token` is served on that host.
- Configure a strong agreement secret (`NEST_MAIL_SECRET_KEY` or the existing app secret, at least 32 characters).
- Optional Turnstile: configure matching backend `NEST_TURNSTILE_SECRET`, backend `NEST_TURNSTILE_SITE_KEY`, and frontend build variable `VITE_TURNSTILE_SITE_KEY`. If the secret is set without the site key, readiness fails and clients cannot request OTPs. If both are unset, the additional challenge is off and token/IP rate limits remain active.

The email layout includes a text Bloomwell brand heading because this repository does not currently contain an approved email-logo asset or canonical absolute logo URL. Do not add an unapproved logo image. The existing Mail diagnostics should be used to inspect SPF, DKIM and DMARC for `bhcug.com`; the agreement checks validate application configuration but do not replace DNS/domain authentication checks.

## 3. Seed and deploy

Standalone website:

```bash
cd backend
python -m app.seed
```

Multi-site hoster (run from the hoster project root):

```bash
python -m projects.nest.seed
```

The existing seed command still requires the configured first-superadmin email and password and a reachable MongoDB. It also seeds the agreement PDF wording. On an existing deployment, check the Template versions screen after seeding; the new source can be a draft pending review.

After deploying code changes, regenerate API types in the website project with the repository's normal toolchain:

```bash
bash scripts/gen-types.sh
```

Commit the generated `frontend/src/types/openapi.json` and `frontend/src/types/api.d.ts` when the route schema changed. Run the repository's GitHub CI and route/scope enforcement tests before release.

## 4. Create, prepare and send

1. Sign in as a staff user with `agreements:read`. Open **Admin → Care operations → Agreements**.
2. Create an agreement (optionally from an enquiry) and assign the responsible nurse. Clinical Schedule A fields may only be changed by the assigned nurse or a superadmin.
3. Complete the staff/clinical sections before sending. The server enforces field ownership; hidden or disabled browser controls are not a security boundary. All staff/clinical-owned Schedule A/B/C fields must contain an appropriate value or be explicitly marked `Not applicable` before sending.
4. The fee calculator follows Clauses 8.2 and 8.4: the UGX 50,000 booking fee is **additional** to the agreed service fees; it is not included in the 50/50 calculation. The advance is 50% of service fees and the balance is the remaining 50%. For USD service fees, the booking fee remains a separate UGX amount; the application does not invent an exchange rate or add unlike currencies together.
5. Client-owned Schedule C fields, patient/representative initials and consent are completed by the client or lawful representative. Staff cannot enter consent, permissions, initials or signatures on the client's behalf. A non-patient decision-maker must also provide their identity, relationship and lawful-authority details.
6. Review the rendered Preview, including the clauses and Schedules A, B and C. Send only after required fields are complete and the external delivery preflight accepts the chosen channel(s). A console mail/SMS adapter does not count as delivery; a send is blocked or returned to draft if no selected channel actually accepts it.
7. The standard link expiry is 14 days; reminders are scheduled at 48 hours and day 5, with an expiry warning 48 hours before expiry. Verify the scheduler is running in the deployed process.

The email and SMS contain a secure review link, not the agreement or clinical information. General notifications do not include patient names, conditions, care tasks, prices, payment details or passwords. OTP codes go only to contacts already stored on the agreement and never to a contact supplied by the person opening the link.

## 5. Client review and signing

- The pre-OTP page exposes only the company name, masked contact destinations and verification prompt. It does not disclose agreement clauses or patient information.
- OTPs expire after 10 minutes, are hashed at rest, allow five attempts and then lock for 15 minutes. Public routes are rate-limited. Turnstile is applied when configured.
- After verification, the client may edit client-owned and shared fields; staff/clinical fields remain read-only. Conflicting revisions are rejected rather than silently overwritten.
- Schedule C decision-maker, care consent, communication permissions, verified contact and initials must be completed. If a representative is signing, their identity, relationship and authority are also required.
- The browser signing page supports a drawn signature. A typed name alone is not accepted. The signature is bound to the SHA-256 of the canonical field values and template version/hash. The backend rejects a stale hash.
- Once the client signs, the original review token is invalidated. Staff edits after sending invalidate the old link and require a new client review. Completed agreements are immutable; create an amendment naming the clause varied. A new amendment does not inherit the old patient consent/initials.

## 6. Countersign, seal, access and void

- A user with `agreements:sign` can countersign. The system renders the completed agreement as a vector PDF with captured signature images and a completion certificate, then stores it in the private bucket.
- Internal staff retrieve the sealed PDF through the authenticated sealed-PDF route. The server verifies the SHA-256 before returning it and sets no-store cache headers.
- A client viewing a completed agreement uses a separate signed-view link and a fresh OTP to access the signed web page. Printing is available from the browser; the client does not need the stored PDF object URL.
- Voiding needs `agreements:void`, a reason and a recently verified authenticator session. Completed agreements are not voided; use an amendment.

## 7. Full workflow diagnostics — run before launch

Open the Agreement workspace and use **Agreement workflow diagnostics**. All diagnostic actions require a recent authenticator/TOTP session; the full simulation additionally requires `agreements:sign`.

### Readiness checks

**Run readiness checks** verifies the MongoDB ping, published source-template structure and hash, corrected email clauses, ownership registry, UGX/USD fee maths, all default/custom message rendering, token secret, Turnstile key pairing, private storage write/read/delete, PDF rendering, lifecycle scheduler job, mail provider settings, MamboSMS settings, required permission scopes, and whether at least one real external customer-delivery channel is ready. It performs only a temporary private-storage probe and deletes it afterward.

A failed `agreement_delivery_channels` check is a hard stop: customer send and OTP delivery are blocked until email or SMS is configured. Warnings (such as Turnstile being off or in-person signing being unavailable) still need an explicit operational decision; do not treat a warning as a pass.

### Full synthetic workflow simulation

**Run full workflow simulation** creates synthetic MongoDB records and exercises the existing agreement service functions. It tests:

- field ownership and required staff/clinical completion;
- the Schedule B booking-fee/separate-50%-50% calculation;
- agreement link and both email/SMS send-template rendering;
- email and SMS OTP rendering, verification and single-use/replay rejection;
- denial of a client attempt to alter a staff-owned fee;
- client consent/permission fields and canonical content hashing;
- rejection of a stale signature hash and invalidation of the review link after signing;
- client signature storage, Bloomwell countersignature, PDF sealing, certificate content hash and private PDF retrieval hash;
- fresh email/SMS OTP rendering for signed-copy viewing;
- amendment parent/variation linkage, fresh consent requirement and amendment notification;
- verified client change request and staff notification rendering;
- void transition and void notice rendering.

**The simulation never sends a message to a client.** A request-local capture intercepts all customer email/SMS, and generated contacts are `.invalid` synthetic addresses. The temporary agreement/OTP/signature/PDF objects are deleted at the end. Append-only audit entries for the synthetic actions are intentionally retained and identifiable by the `BHC-TEST-` reference. A cleanup warning means inspect the reported `BHC-TEST-` prefix before running it again. The simulation calls the real database/service/storage/PDF functions but is not a substitute for browser-level route tests, an external Turnstile verification, or real provider delivery.

### Real notification self-tests

- **Send test email to me** sends a prominently labelled test only to the currently authenticated staff account's own email address.
- **Send test SMS to me** sends a clearly labelled `Bloomwell: TEST ONLY` SMS only to the staff user's saved mobile number.
- In the message editor, **Send test to me** sends a stage-specific labelled preview to the same staff-owned destination. It requires TOTP and blocks console/fake providers.

These actions are the only diagnostic steps that transmit externally. A provider's accepted/queued result is not proof of inbox or handset delivery. Confirm each message actually arrives on the device/account. Do not use a client record for delivery tests.

Run the Mail section's SPF/DKIM/DMARC and outbox diagnostics as well. The agreement readiness check does not prove sender-domain authentication, inbox placement, carrier delivery or that a real client can access your public site.

## 8. Known limitations — do not promise these to clients

- The S6 assisted in-person tablet flow, thumbprint capture, witness workflow and interpreter/reader certificate flow are not enabled. The placeholder in-person route returns HTTP 501; it does not mint a fake session token. A client who needs the assisted process must not be sent through the drawn-signature-only online flow until S6 is completed and reviewed.
- The optional client “send me a copy” task, staff in-app notification surfaces, message-template version history/restore, and payment-due reminders are not fully implemented. Payment reminders remain off.
- The e-signature and consent workflow has not been certified as compliant by a Ugandan lawyer. Obtain legal review for the Electronic Signatures Act CAP 98, the Data Protection and Privacy Act CAP 97, evidence, representative authority, retention, and the interpreter/illiteracy procedure before production use.

## 9. Release checklist

- [ ] Source PDF has been visually compared with the seeded template; only the two requested emails were changed.
- [ ] Legal owner/lawyer approves the exact template version and the electronic consent/signature evidence.
- [ ] TOTP is enrolled for every user who can publish templates, void or run privileged diagnostics.
- [ ] Real email and/or SMS provider passes its own diagnostics; a staff self-test is received on the actual device.
- [ ] Public `https://bhcug.com/agreement/:token` routing and TLS work on a real phone/network.
- [ ] Private storage, PDF sealing, database and scheduler checks pass.
- [ ] Readiness checks have no failures; all warnings are understood and accepted by the owner.
- [ ] Full synthetic workflow simulation passes and cleanup reports success.
- [ ] Backend tests, route coverage, scope enforcement, frontend tests/build, OpenAPI regeneration and GitHub CI pass.
- [ ] A controlled internal pilot is completed before the first customer send.

## 10. Troubleshooting

- **Template missing / wrong version:** check Template versions. Run the seed command; inspect the source-backed draft if another version is already published. Publish only after comparison and TOTP verification.
- **Send blocked:** check the selected channel's provider configuration, domain/credentials, stored client email/phone and `agreement_delivery_channels`. A console provider is not a delivery channel.
- **OTP not received:** inspect mail outbox or MamboSMS logs/daily limits, verify the contact saved on the agreement, check provider receipt and Turnstile configuration. Failed delivery invalidates the code.
- **Old link unavailable:** this is expected after staff revision, client signing, reissue, expiry or void. Use only the latest issued link.
- **PDF seal failure:** inspect WeasyPrint/Pango packages, private storage access and diagnostic cleanup. Do not send a manually produced or unverified PDF as the official sealed copy.
- **Test run leaves artifacts:** note the `BHC-TEST-` reference from the failure result; inspect the agreement/OTP collections and private `agreements/<reference>/` keys before cleanup.
