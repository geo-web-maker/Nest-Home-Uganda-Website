# Care forms (Bloomwell pack, Forms 01 to 12): client-side implementation

Companion to the Patient Consent and Care Forms PDF. Status: plan only. Nothing here is built yet.
The OTP timer, the readable certificate and the signed-PDF download described at the end ARE built.

## 1. Who touches which form
| Form | Who fills it | Where | Signature |
|---|---|---|---|
| 03 Consent to care, 04 Procedure consent, 05 Privacy and communication choices, 11 Refusal/withdrawal | Clinician starts it, patient or authorised representative signs | Public page (same link + OTP + signature flow as the care agreement) | Drawn, device biometric or passphrase, or thumbprint with interpreter block |
| 01, 02, 06, 12 | Staff / nurse | Admin or nurse app | Clinician name, UNMC number, server time |
| 07, 08, 09, 10 | Nurse, per visit | Nurse app (phone first) | Clinician, server time |

Only the first row is "client side". The rest are staff screens.

## 2. Client-side flow for forms 03, 04, 05, 11
Reuse `/public/agreements` instead of building a second signing system.
1. Staff creates a **consent request** in admin (form type + patient record + procedure text for Form 04). The server sends the link by SMS/email.
2. Client opens the link, passes the OTP screen (60 s resend timer, shared by SMS and email), then sees ONE form at a time.
3. Screen layout (mobile first): plain-language summary, the form text, "I understand" checkboxes, capacity/authority block (patient, parent/guardian, representative with evidence), interpreter/reader block (name, address, language) shown when "cannot read" is ticked, then signature.
4. Form 05 is a checklist screen: people allowed to receive updates (repeatable rows), channel choice, photograph yes/no. Unticked means no permission. Show the more restrictive rule when it conflicts with Schedule C.
5. Sign, then the server seals a PDF with the certificate. The client receives it by email and can download it again from the signed-copy link.

## 3. Rules the client screens must enforce
- Under 18: require parent/guardian name, relationship and evidence before the sign button enables.
- Someone other than the patient signs: require legal basis and evidence. Payer, relative or emergency contact is not enough.
- Thumbprint or cannot read: require the interpreter/reader block, witness recommended.
- Form 04 cannot start until Form 03 exists. Before each procedure the nurse re-confirms consent in Form 07.
- Never pre-fill signatures or dates. Dates come from the server.
- Give the patient a copy (PDF by email, download link).
- Refusal (Form 11) never blocks other accepted care and is not a waiver.

## 4. Data model (MongoDB, one pack per patient)
- `patients` (mother and baby are separate records)
- `consents` {patient_id, form_type 03|04|05|11, version, answers{}, signer{role, name, authority}, interpreter{}, witness{}, status, pdf_key, pdf_sha256}
- Records 07/08/09/10 are append-only entries: corrections are new entries that reference the old one, never edits.

## 5. Build order
1. Patient record + Forms 01, 02 (admin).
2. Consent request engine on the agreement flow: forms 03, 05, then 04 and 11.
3. Visit logs 07 to 10 in the nurse app.
4. Form 06 and 12 and the pack version/review control.

## 6. Already built in this update
- OTP screen: wait message, 60 s resend countdown (server enforced, shared by SMS and email), auto-submit on 6 digits.
- Certificate of completion: readable layout. On screen it hides IP, browser and contact details; the sealed PDF keeps the full evidence.
- Public `GET /api/v1/public/agreements/session/signed/pdf`: serves the ready-made sealed PDF (integrity-checked) to a verified signed-copy session, with a "Download signed PDF" button.
- Sealing now renders the PDF off the event loop.
- Verify page `/verify/<reference>/<code>`: the sealed PDF's certificate page carries a QR code and link. The page (site styling) confirms the agreement is genuine, shows masked client name and signing dates, and lets the person pick their PDF to check it against the sealed original. The check runs in the browser (SHA-256), nothing is uploaded. The code is the first 16 characters of the content fingerprint, so references cannot be guessed; a wrong reference or code gives the same "no match" answer; 20 checks per 15 minutes per visitor.
- New dependency `segno` (QR codes) in `requirements.lock` and `pyproject.toml`. If it is missing the PDF still prints the link, without the QR.
- Only PDFs sealed AFTER this release carry the verify box. Older sealed PDFs are unchanged (their stored copy is never rewritten).

## 7. After merging
- Run `pytest backend/tests/test_agreement_certificate.py` and the existing agreement tests.
- Regenerate `frontend/src/types/openapi.json` and `api.d.ts` (new route, new `otp_cooldown` error, new response fields). Not regenerated here.
- Production needs the WeasyPrint runtime (Pango/Cairo) in the backend image; the Dockerfile already installs it. If PDFs fail, run the admin agreement diagnostics: `agreement_pdf_renderer`.
- Form pack text still mixes "Nest Mama Program", "BLOOMWELL" and the privacy email `info@wellnesthomecareug.com` while the site uses `bhcug.com`. Align before go-live.
