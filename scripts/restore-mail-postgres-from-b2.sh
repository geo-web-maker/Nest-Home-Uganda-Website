#!/usr/bin/env bash
set -euo pipefail

[[ "${RESTORE_TARGET_ISOLATED:-}" == "yes" ]] || {
  echo 'Refusing restore: set RESTORE_TARGET_ISOLATED=yes only for a verified isolated target.' >&2
  exit 2
}
: "${BACKUP_RESTORE_URI:?BACKUP_RESTORE_URI is required}"
: "${BACKUP_OBJECT_KEY:?BACKUP_OBJECT_KEY must identify the encrypted dump object}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
: "${B2_ENDPOINT:?B2_ENDPOINT is required}"
: "${B2_KEY:?B2_KEY is required}"
: "${B2_SECRET:?B2_SECRET is required}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
command -v pg_restore >/dev/null
command -v openssl >/dev/null
command -v sha256sum >/dev/null
command -v aws >/dev/null

umask 077
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
filename="$(basename "$BACKUP_OBJECT_KEY")"
[[ "$filename" == nest-mail-postgres-*.dump.enc ]] || {
  echo 'Refusing restore: unexpected object key filename.' >&2
  exit 2
}
export AWS_ACCESS_KEY_ID="$B2_KEY" AWS_SECRET_ACCESS_KEY="$B2_SECRET"
aws s3 cp "s3://${BACKUP_BUCKET}/${BACKUP_OBJECT_KEY}" "$work_dir/$filename" \
  --endpoint-url "$B2_ENDPOINT" --only-show-errors
aws s3 cp "s3://${BACKUP_BUCKET}/${BACKUP_OBJECT_KEY}.sha256" "$work_dir/$filename.sha256" \
  --endpoint-url "$B2_ENDPOINT" --only-show-errors
(cd "$work_dir" && sha256sum --check "$filename.sha256")
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in "$work_dir/$filename" -out "$work_dir/mail.dump" \
  -pass env:BACKUP_PASSPHRASE
# Deliberately additive: no --clean, --create, dropdb or destructive database action.
pg_restore --no-owner --no-acl --dbname="$BACKUP_RESTORE_URI" "$work_dir/mail.dump"
printf 'Mail database restore completed into the owner-designated isolated target.\n'
