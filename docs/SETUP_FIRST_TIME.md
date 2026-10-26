# First-time setup order

This checklist uses owner-supplied values. It does not invent domains, phone numbers, legal text, credentials, or business thresholds.

## 1. Boot the server

- Set `APP_ENV`, `SECRET_KEY`, `IP_HASH_SALT`, `MONGODB_URI`, `MONGODB_DB`, `CARE_MONGODB_URI`, `CARE_MONGODB_DB`, `CORS_ORIGINS`, and `FRONTEND_URL`.
- Keep the care database name separate from the public-site database. The URI may also be separate.
- Run the numbered migrations from a host that can reach both databases.
- Care modules remain unavailable until database connections and migrations are complete.

## 2. Database and storage

- Configure external MongoDB network allow-lists and least-privilege users for both databases.
- Configure `B2_ENDPOINT`, `B2_KEY`, `B2_SECRET`, `BACKUP_BUCKET`, and `BACKUP_PASSPHRASE` on the owner-controlled backup host. Set source URIs there, not in GitHub-hosted runners.
- Configure the S3-compatible media storage values already used by the website.
- Complete and record an isolated restore drill before enabling care modules.

## 3. SMS

- Set the MamboSMS provider and credentials in the hosting secret store.
- Set the sender ID, staff recipient numbers, alert quiet hours, monthly cap, and test number using documented environment variables or care settings.
- Keep the test number owner-supplied. SMS templates intentionally omit client names, addresses, and health information.

## 4. Photos

- Create the Cloudinary account and set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`.
- Configure photo limits and guidance in care settings. Photo upload remains disabled until Cloudinary is configured and the owner approves the retention policy.

## 5. Push notifications

- Create or select the owner-approved Firebase project and register both Android app IDs.
- Set `PUSH_SENDER=fcm`, `FCM_PROJECT_ID`, and one service-account JSON secret or its base64 form. Never commit the service-account file.
- Until this step is complete, the sender stays in `fake` mode and does not contact the push service.

## 6. Android signing and Firebase build values

- Set `CAP_APP_ID_NURSE` and `CAP_APP_ID_ADMIN` to the approved IDs. The recorded values are `ug.nesthomecare.nurse` and `ug.nesthomecare.admin`.
- Configure Android signing secrets and Firebase build values in the build provider. Do not commit signing keys or `google-services.json`.
- Generate Android projects in the CI build environment; generated folders are not committed.

## 7. Care settings and owner-supplied text

- Supply the privacy notice and version, location consent text and version, prominent Android location disclosure, photo guidance, SOS procedure, emergency numbers, test SMS number, and retention periods. These values have no invented legal or clinical defaults.
- The readiness endpoint must show required values as missing until supplied.
- Confirm at least one active supervisor has at least one nurse.
- Confirm database tier and restore-test status with the owner before marking those readiness items complete.

## 8. Enable modules gradually

- Keep `care.module_enabled`, `care.module_b_enabled`, `care.module_c_enabled`, and `care.module_d_enabled` disabled until their readiness checks and acceptance tests are complete. Module D was not approved and must remain disabled.
- Start with nurse accounts, assigned visits, and offline sync. Then enable photo proof, timesheets and alerts only after dependencies are configured.
- Enable SOS only after the responder chain, SMS, emergency numbers, secure acknowledgement route, and test mode are reviewed.
