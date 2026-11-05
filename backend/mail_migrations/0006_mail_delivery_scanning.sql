-- Delivery event timeline and attachment scan evidence.
ALTER TABLE attachment
  ADD COLUMN IF NOT EXISTS scanned_at timestamptz,
  ADD COLUMN IF NOT EXISTS scan_detail text;

CREATE TABLE IF NOT EXISTS delivery_event (
  id bigserial PRIMARY KEY,
  outbox_id uuid NOT NULL REFERENCES outbox(id) ON DELETE CASCADE,
  address text NOT NULL,
  event text NOT NULL,
  detail text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_event_outbox_at_idx
  ON delivery_event (outbox_id, at DESC);
CREATE INDEX IF NOT EXISTS outbox_provider_message_id_idx
  ON outbox (provider_message_id);

ALTER TABLE delivery_event ADD COLUMN IF NOT EXISTS event_key text;
CREATE UNIQUE INDEX IF NOT EXISTS delivery_event_event_key_idx
  ON delivery_event (event_key) WHERE event_key IS NOT NULL;
