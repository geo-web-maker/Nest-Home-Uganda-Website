# Mail backup and recovery with Backblaze B2

This follows the owner-run model in `docs/BACKUP_AND_RECOVERY_B2.md`: encrypted artifacts, B2 S3 API, a restore target explicitly isolated by the owner, and no GitHub runner connecting to a database.

## Required environment

- `NEST_PG_URL`: source Neon pooled connection string for backup.
- `BACKUP_PASSPHRASE`: strong offline-held passphrase used by OpenSSL PBKDF2 encryption.
- `B2_ENDPOINT`, `B2_KEY`, `B2_SECRET`, `BACKUP_BUCKET`: B2 S3 endpoint, application key ID, application key and dump bucket.
- For attachment copy: `S3_ENDPOINT`, `S3_KEY`, `S3_SECRET`, `S3_BUCKET_MAIL`, `B2_ENDPOINT`, `B2_KEY`, `B2_SECRET`, and `MAIL_BACKUP_ATTACHMENTS_BUCKET`.
- For restore only: `RESTORE_TARGET_ISOLATED=yes`, `BACKUP_RESTORE_URI`, and `BACKUP_OBJECT_KEY`.

Install `pg_dump`, `pg_restore`, `openssl`, `sha256sum`, and AWS CLI v2 on the owner-controlled backup host. Never place these credentials in CI.

## Create a database backup

Run `scripts/backup-mail-postgres-to-b2.sh`. It creates a custom-format `pg_dump`, encrypts it with AES-256-CBC and PBKDF2, writes a SHA-256 checksum, and uploads both objects to the configured B2 bucket. Filenames include a UTC timestamp. Secrets and message content are never printed.

## Rotate the mail secret-encryption key

Run `scripts/rotate-mail-secret-key.py` on the owner-controlled host before replacing the active key. Export the old key as the temporary `NEST_MAIL_SECRET_KEY_OLD`, export the intended new key as `NEST_MAIL_SECRET_KEY`, and set `NEST_PG_URL`. The command decrypts all stored secrets in memory first; if any row cannot be decrypted, it exits before changing any row. It then re-encrypts every secret in one database transaction and writes value-free audit rows. After success, redeploy with the new `NEST_MAIL_SECRET_KEY`, remove the temporary old-key variable and securely retire the old key according to the owner's recovery policy. The script never prints secret values.

## Restore drill

Run `scripts/restore-mail-postgres-from-b2.sh` only after creating a separate isolated Neon/Postgres restore target. Set `RESTORE_TARGET_ISOLATED=yes`, `BACKUP_RESTORE_URI`, and the exact `BACKUP_OBJECT_KEY`. The script verifies the downloaded checksum, decrypts the dump, and restores additively with `pg_restore --no-owner`; it never uses `--clean` or drops a database. Do not point the restore URI at production.

## Attachment copy

Run `scripts/sync-mail-attachments-to-b2.sh`. It downloads the configured mail bucket to a temporary directory through the R2 endpoint and uploads that copy to the second B2 bucket. Temporary files are removed on exit. This is a mirror, not an immutable backup by itself; enable R2 object versioning and configure B2 Object Lock and lifecycle retention in their respective consoles.

## Restore drill record

Test a restore monthly. Record only the date, source object key, restored row counts and duration. Do not include addresses, message subjects, message bodies, attachment names or other personal data in the record. Neon point-in-time restore remains the first recovery option for recent mistakes; B2 is the independent encrypted copy.
