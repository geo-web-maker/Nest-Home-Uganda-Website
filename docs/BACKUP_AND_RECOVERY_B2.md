# MongoDB backup and recovery using Backblaze B2

## Approved topology

- Both application MongoDB databases remain external to Northflank and private.
- GitHub-hosted runners must not connect directly to either database.
- Use provider-managed backups for each external database, plus periodic owner-run `mongodump` operations from a trusted machine that can reach the private database endpoints.
- Upload independent encrypted artifacts to Backblaze B2 using the B2 S3-compatible API.
- Configure B2 bucket Object Lock and retention in the B2 console. This configuration cannot be created from repository code and must be confirmed by the owner.
- Cloudinary photos are not included in MongoDB dumps. Enable Cloudinary's own backup option as required by the build plan.

## Owner-run backup procedure

1. On a trusted machine, install MongoDB Database Tools, OpenSSL, and AWS CLI.
2. Set `MONGODB_URI` for one database only, plus `BACKUP_LABEL=primary` or `BACKUP_LABEL=care`.
3. Set `BACKUP_PASSPHRASE`, `B2_ENDPOINT`, `B2_KEY`, `B2_SECRET`, and `BACKUP_BUCKET` through the shell's secret manager, not in shell history or source files.
4. Run `bash scripts/backup-mongodb-to-b2.sh`. Repeat for the other database with its own URI and label.
5. Confirm the uploaded objects and checksum files in B2. Confirm bucket Object Lock and retention are enabled.
6. Keep a recovery copy of `BACKUP_PASSPHRASE` offline. Losing it makes encrypted dumps unrecoverable.

## Restore drill

1. Choose a backup object and retrieve it to a trusted owner machine.
2. Create or select an isolated, disposable MongoDB restore target. It must not contain production data that needs to be preserved.
3. Set `BACKUP_RESTORE_URI` to the isolated target, `RESTORE_TARGET_ISOLATED=yes`, and `BACKUP_OBJECT_KEY` to the complete object key without the bucket prefix.
4. Run `bash scripts/restore-mongodb-from-b2.sh`.
5. Compare collection counts and representative non-sensitive records against the backup manifest or provider backup record. Record the date, object key, database label, counts, duration, and any issue in the owner's operational log. Never include secrets or personal/health data in the log.

## GitHub workflow boundary

`backup.yml` and `restore-drill.yml` do not connect to MongoDB because the owner selected private connectivity option B. They provide a manual operational checkpoint and document the required owner-run procedure. This is not an automated database dump from GitHub Actions. If automated remote dumps are required later, the owner must approve a private runner/network design first.

## Retention and safety

- Keep backups encrypted before upload.
- Limit B2 application keys to the required bucket and operations.
- Use separate credentials for each MongoDB database where possible.
- Test restores periodically. A successful upload alone is not proof of recoverability.
- Do not run `--drop` except against the explicitly isolated restore target.
- Do not place real URIs, passphrases, B2 credentials, database names containing customer identifiers, or backup content in GitHub logs.
