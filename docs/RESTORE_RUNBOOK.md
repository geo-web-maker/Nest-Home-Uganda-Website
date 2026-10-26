# Restore runbook: external MongoDB and Backblaze B2

**Owner-controlled operation only.** GitHub-hosted runners must not connect to production MongoDB. Do not run `mongorestore --drop` against a production URI.

## Before starting

- [ ] Declare the incident and appoint the person coordinating recovery: `client to supply`.
- [ ] Confirm the affected database label: `primary` or `care`.
- [ ] Select an encrypted backup object and verify its timestamp and label in B2.
- [ ] Confirm the recovery target is isolated and disposable. Write down the target database name without including credentials.
- [ ] Retrieve the passphrase from the approved secret vault. Do not put it in shell history, a ticket, or a log.
- [ ] Ensure MongoDB Database Tools, OpenSSL, and AWS CLI are installed on the trusted recovery host.

## Restore procedure

1. Set `B2_ENDPOINT`, `B2_KEY`, `B2_SECRET`, `BACKUP_BUCKET`, `BACKUP_PASSPHRASE`, `BACKUP_OBJECT_KEY`, and `BACKUP_RESTORE_URI` in the host's secret environment.
2. Set `RESTORE_TARGET_ISOLATED=yes` only after a second person has confirmed the target is disposable.
3. Run `bash scripts/restore-mongodb-from-b2.sh` from the repository root.
4. Confirm the script reports a checksum match and completes the restore.
5. Compare collection counts and representative IDs against the backup record. The current script does not produce a complete signed manifest, so record the limitation and do not treat a successful command alone as a full restore drill.
6. Run application smoke checks against the isolated target only. Confirm the public and care databases remain separate.
7. Record the result, duration, backup object key, counts, and issues below. Do not record credentials, personal details, health information, or raw records.

## Recovery record

- Date/time: `client to supply`
- Operator and reviewer: `client to supply`
- Database label: `client to supply`
- Backup object key: `client to supply`
- Restore target identifier: `client to supply`
- Collection count comparison: `client to supply`
- Smoke-check result: `client to supply`
- Recovery time and data-loss window: `client to supply`
- Issues and follow-up owner: `client to supply`

## Stop conditions

Stop if the checksum fails, the passphrase is unavailable, the target cannot be proven isolated, MongoDB reports a permission/network error, or the restored data differs materially from the expected manifest. Escalation contact: `client to supply`.
