ALTER TABLE outbox ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS counter_reserved boolean NOT NULL DEFAULT false;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS counter_day date;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS counter_month date;
CREATE INDEX IF NOT EXISTS outbox_stale_claim_idx ON outbox(claimed_at) WHERE state='sending';
