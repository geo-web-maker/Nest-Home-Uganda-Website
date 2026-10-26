#!/usr/bin/env bash
set -Eeuo pipefail

# Run on a trusted owner-controlled machine with network access to the private MongoDB URI.
# Required environment variables: MONGODB_URI, BACKUP_PASSPHRASE, B2_ENDPOINT, B2_KEY,
# B2_SECRET, BACKUP_BUCKET. Optional: BACKUP_LABEL. This script does not run in CI.
for name in MONGODB_URI BACKUP_PASSPHRASE B2_ENDPOINT B2_KEY B2_SECRET BACKUP_BUCKET; do
  if [[ -z "${!name:-}" ]]; then echo "Missing required environment variable: ${name}" >&2; exit 2; fi
done
command -v mongodump >/dev/null || { echo 'mongodump is required on the owner host' >&2; exit 2; }
command -v openssl >/dev/null || { echo 'openssl is required on the owner host' >&2; exit 2; }
command -v aws >/dev/null || { echo 'AWS CLI is required for the B2 S3-compatible endpoint' >&2; exit 2; }

label="${BACKUP_LABEL:-primary}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
archive="${label}-${timestamp}.archive.gz"
encrypted="${archive}.enc"

mongodump --uri "$MONGODB_URI" --archive="$workdir/$archive" --gzip
openssl enc -aes-256-cbc -pbkdf2 -salt -in "$workdir/$archive" -out "$workdir/$encrypted" -pass env:BACKUP_PASSPHRASE
sha256sum "$workdir/$encrypted" > "$workdir/$encrypted.sha256"
export AWS_ACCESS_KEY_ID="$B2_KEY"
export AWS_SECRET_ACCESS_KEY="$B2_SECRET"
aws --endpoint-url "$B2_ENDPOINT" s3 cp "$workdir/$encrypted" "s3://${BACKUP_BUCKET}/mongodb/${label}/${encrypted}" --only-show-errors
aws --endpoint-url "$B2_ENDPOINT" s3 cp "$workdir/$encrypted.sha256" "s3://${BACKUP_BUCKET}/mongodb/${label}/${encrypted}.sha256" --only-show-errors
printf 'Uploaded encrypted backup: s3://%s/mongodb/%s/%s
' "$BACKUP_BUCKET" "$label" "$encrypted"
printf 'IMPORTANT: configure Object Lock/retention on the B2 bucket and keep BACKUP_PASSPHRASE offline.
'
