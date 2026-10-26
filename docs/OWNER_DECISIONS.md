# Nurse Module owner decisions

Date: 2026-10-25

These decisions were provided in chat before implementation. No credentials, hostnames, bucket names, project IDs, database URIs, or other deployment secrets were supplied or invented.

| Item | Decision | Implementation consequence |
| --- | --- | --- |
| Package pins | Accept recommended compatible exact pins; preserve existing shared package pins. | `docs/PINS_NURSE.md` records the selected pins. Versions must still be validated by CI. |
| Android SMS | Use `@byteowls/capacitor-sms` only for opening the device SMS flow; do not claim silent background sending. | SOS has an explicit manual fallback. |
| Background location | Not approved. | Foreground location only; no background-location plugin or permissions. |
| Secure storage | Use `capacitor-secure-storage-plugin` for native refresh-token storage. | Browser storage fallback is not treated as secure. |
| Admin app ID | Accept recommended `ug.nesthomecare.admin`. | Nurse app ID: `ug.nesthomecare.nurse`; actual Firebase registration values remain owner-supplied. |
| API origin | Use existing `VITE_API_URL` at build time. | No API URL is hard-coded. |
| Admin offline sign-in | Seven days, as recommended. | Enforce a bounded offline session and clear local data on expiry/sign-out. |
| Admin app lock | No separate app PIN/biometric lock. Require device screen lock. | Do not add a second lock screen. |
| Firebase | One Firebase project, two separate Android app registrations. | Push support is configured from environment variables; no Firebase file is committed. |
| `cryptography` | Approved as the narrow exception required for RS256 Firebase service-account JWT signing. | Pin `cryptography` in backend dependencies. |
| Module D / WO-18 | Not approved. | WO-18 is skipped; `care.module_d_enabled` remains false and read-only. |
| Hosting | Northflank backend, existing Vercel frontend. | Add a Northflank deployment checklist; no hosting values are invented. |
| MongoDB | Keep both existing MongoDB databases external. Do not use the Northflank MongoDB add-on. | Database connection strings remain secrets supplied by the owner. Both databases must be included in the owner's backup inventory. |
| GitHub runner database access | Option B. Keep MongoDB private; rely on platform/provider-managed backups plus periodic owner-run `mongodump` operations. | GitHub runners must not connect directly to MongoDB. B2 backup/restore scripts are designed for a trusted owner-controlled machine. |
| Backblaze B2 | Include B2 as the off-site destination for encrypted database backup artifacts. | Use B2 S3-compatible endpoint and credentials supplied as environment variables; configure Object Lock at the bucket/provider level. |
| Public booking medical-details warning | Approved in chat on 2026-10-25 (option B). | Add the exact sentence “Please do not enter medical details here” to the public booking form and cover it with a test. Preserve the existing mandatory consent checkbox. |

## Important operational distinction

The choice to keep MongoDB private means a scheduled GitHub runner cannot create a fresh database dump unless a safe private connectivity design is separately approved. The implementation therefore provides owner-run dump/encrypt/upload and restore-drill scripts, plus documentation for provider-managed backups. The GitHub workflows do not attempt to connect to the private databases. This is deliberate, not a claim that scheduled off-host dumping has been automated.



## Implementation note added 2026-10-25

The existing website's enquiry retention job has an established 24-month cutoff and existing tests depend on that behaviour. The care retention scheduler is being added as a separate job with owner-managed care periods. The `retention.requests_months` spec item still needs a deliberate compatibility decision before changing the legacy enquiry job; this ZIP does not silently alter that existing public-site retention behaviour.
