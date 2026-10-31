CREATE TABLE IF NOT EXISTS mailbox_blocked_sender (
  mailbox_id uuid NOT NULL REFERENCES mailbox(id) ON DELETE CASCADE,
  address citext NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(mailbox_id,address)
);
CREATE TABLE IF NOT EXISTS message_label (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mailbox_id uuid NOT NULL REFERENCES mailbox(id),
  name text NOT NULL, colour text NOT NULL DEFAULT 'neutral', created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mailbox_id,name)
);
CREATE TABLE IF NOT EXISTS message_label_link (
  mailbox_message_id uuid NOT NULL REFERENCES mailbox_message(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES message_label(id) ON DELETE CASCADE,
  PRIMARY KEY(mailbox_message_id,label_id)
);
CREATE TABLE IF NOT EXISTS mailbox_signature (
  mailbox_id uuid PRIMARY KEY REFERENCES mailbox(id) ON DELETE CASCADE,
  body_text text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mailbox_forward_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mailbox_id uuid NOT NULL REFERENCES mailbox(id) ON DELETE CASCADE,
  target_address citext NOT NULL, enabled boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mail_restore_drill (
  id bigserial PRIMARY KEY, performed_at timestamptz NOT NULL DEFAULT now(), object_key text NOT NULL,
  row_count bigint NOT NULL, duration_seconds numeric NOT NULL
);
CREATE INDEX IF NOT EXISTS mailbox_message_trash_idx ON mailbox_message(trashed_at) WHERE folder IN ('trash','spam');
CREATE INDEX IF NOT EXISTS mail_outbox_claim_idx ON outbox(priority,next_attempt_at,created_at) WHERE state IN ('queued','deferred');
