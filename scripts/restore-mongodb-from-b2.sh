#!/usr/bin/env bash
set -Eeuo pipefail

# Restore into an isolated, disposable database. Never point this at production.
for name in B2_ENDPOINT B2_KEY B2_SECRET BACKUP_BUCKET BACKUP_PASSPHRASE BACKUP_OBJECT_KEY BACKUP_RESTORE_URI; do
  if [[ -z "${!name:-}" ]]; then echo "Missing required environment variable: ${name}" >&2; exit 2; fi
done
command -v mongorestore >/dev/null || { echo 'mongorestore is required on the owner host' >&2; exit 2; }
command -v openssl >/dev/null || { echo 'openssl is required on the owner host' >&2; exit 2; }
command -v aws >/dev/null || { echo 'AWS CLI is required for the B2 S3-compatible endpoint' >&2; exit 2; }
if [[ "${RESTORE_TARGET_ISOLATED:-}" != "yes" ]]; then echo 'Set RESTORE_TARGET_ISOLATED=yes only after confirming the target is disposable and isolated.' >&2; exit 2; fi
workdir="$(mktemp -d)"; trap 'rm -rf "$workdir"' EXIT
export AWS_ACCESS_KEY_ID="$B2_KEY" AWS_SECRET_ACCESS_KEY="$B2_SECRET"
aws --endpoint-url "$B2_ENDPOINT" s3 cp "s3://${BACKUP_BUCKET}/${BACKUP_OBJECT_KEY}" "$workdir/backup.enc" --only-show-errors
aws --endpoint-url "$B2_ENDPOINT" s3 cp "s3://${BACKUP_BUCKET}/${BACKUP_OBJECT_KEY}.sha256" "$workdir/backup.enc.sha256" --only-show-errors
expected="$(awk '{print $1}' "$workdir/backup.enc.sha256")"
actual="$(sha256sum "$workdir/backup.enc" | awk '{print $1}')"
[[ "$expected" == "$actual" ]] || { echo "Backup checksum mismatch" >&2; exit 1; }
openssl enc -d -aes-256-cbc -pbkdf2 -in "$workdir/backup.enc" -out "$workdir/backup.archive.gz" -pass env:BACKUP_PASSPHRASE
mongorestore --uri "$BACKUP_RESTORE_URI" --archive="$workdir/backup.archive.gz" --gzip --drop
printf 'Restore command completed against the isolated target. Compare expected collection counts before accepting the drill.
'
