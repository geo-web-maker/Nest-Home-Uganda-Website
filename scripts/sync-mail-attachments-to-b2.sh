#!/usr/bin/env bash
set -euo pipefail

: "${S3_ENDPOINT:?S3_ENDPOINT (R2 endpoint) is required}"
: "${S3_KEY:?R2 access key is required}"
: "${S3_SECRET:?R2 secret key is required}"
: "${S3_BUCKET_MAIL:?S3_BUCKET_MAIL is required}"
: "${B2_ENDPOINT:?B2_ENDPOINT is required}"
: "${B2_KEY:?B2_KEY is required}"
: "${B2_SECRET:?B2_SECRET is required}"
: "${MAIL_BACKUP_ATTACHMENTS_BUCKET:?MAIL_BACKUP_ATTACHMENTS_BUCKET is required}"
command -v aws >/dev/null

umask 077
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
# Stage locally because the AWS CLI endpoint applies to both sides of a sync command.
AWS_ACCESS_KEY_ID="$S3_KEY" AWS_SECRET_ACCESS_KEY="$S3_SECRET" \
  aws s3 sync "s3://${S3_BUCKET_MAIL}/" "$work_dir/" \
  --endpoint-url "$S3_ENDPOINT" --only-show-errors
AWS_ACCESS_KEY_ID="$B2_KEY" AWS_SECRET_ACCESS_KEY="$B2_SECRET" \
  aws s3 sync "$work_dir/" "s3://${MAIL_BACKUP_ATTACHMENTS_BUCKET}/" \
  --endpoint-url "$B2_ENDPOINT" --only-show-errors
printf 'Mail attachment mirror completed to the configured B2 bucket.\n'
