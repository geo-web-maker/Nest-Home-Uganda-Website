-- One row per call to POST /mail/inbound, including refused ones, so a missing message can be traced.
CREATE TABLE IF NOT EXISTS inbound_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL,          -- delivered | orphaned | duplicate | refused | error
  reason text,
  http_status int,
  envelope_to text[],
  routing jsonb,
  object_key text,
  size_bytes int,
  folder text,
  message_id uuid,
  remote_ip text,
  user_agent text,
  skew_seconds int,
  ms int
);
CREATE INDEX IF NOT EXISTS inbound_log_at_idx ON inbound_log (at DESC);
