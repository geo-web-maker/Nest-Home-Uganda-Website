-- Record when a provider side-effect may have begun. If the worker lease expires
-- after this point, SMTP cannot guarantee idempotency; recovery requires review.
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS send_started_at timestamptz;
