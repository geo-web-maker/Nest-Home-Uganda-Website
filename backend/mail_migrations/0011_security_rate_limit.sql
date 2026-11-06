-- Shared rate limits for high-risk authenticator endpoints across all Hoster workers.
CREATE TABLE IF NOT EXISTS security_rate_limit (
  bucket_key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL CHECK (hits >= 0)
);
CREATE INDEX IF NOT EXISTS security_rate_limit_window_idx ON security_rate_limit(window_start);
