#!/usr/bin/env bash
set -euo pipefail

: "${NEST_PG_URL:?NEST_PG_URL is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
: "${B2_ENDPOINT:?B2_ENDPOINT is required}"
: "${B2_KEY:?B2_KEY is required}"
: "${B2_SECRET:?B2_SECRET is required}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"
command -v pg_dump >/dev/null
command -v openssl >/dev/null
command -v sha256sum >/dev/null
command -v aws >/dev/null

umask 077
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
base="nest-mail-postgres-${stamp}.dump.enc"
pg_dump --format=custom --no-owner --no-acl --dbname="$NEST_PG_URL" --file="$work_dir/mail.dump"
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
  -in "$work_dir/mail.dump" -out "$work_dir/$base" \
  -pass env:BACKUP_PASSPHRASE
(cd "$work_dir" && sha256sum "$base" > "$base.sha256")
export AWS_ACCESS_KEY_ID="$B2_KEY" AWS_SECRET_ACCESS_KEY="$B2_SECRET"
aws s3 cp "$work_dir/$base" "s3://${BACKUP_BUCKET}/mail/postgres/$base" \
  --endpoint-url "$B2_ENDPOINT" --only-show-errors
aws s3 cp "$work_dir/$base.sha256" "s3://${BACKUP_BUCKET}/mail/postgres/$base.sha256" \
  --endpoint-url "$B2_ENDPOINT" --only-show-errors
printf 'Mail database backup uploaded: %s\n' "$base"
