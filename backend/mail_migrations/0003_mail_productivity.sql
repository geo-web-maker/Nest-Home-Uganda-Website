CREATE TABLE IF NOT EXISTS mailbox_contact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mailbox_id uuid NOT NULL REFERENCES mailbox(id) ON DELETE CASCADE,
  address citext NOT NULL, display_name text NOT NULL DEFAULT '', last_used_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mailbox_id,address)
);
CREATE TABLE IF NOT EXISTS mailbox_auto_reply (
  mailbox_id uuid PRIMARY KEY REFERENCES mailbox(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false, subject text NOT NULL DEFAULT 'Out of office',
  body_text text NOT NULL DEFAULT '', starts_at timestamptz, ends_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mailbox_contact_recent_idx ON mailbox_contact(mailbox_id,last_used_at DESC);
CREATE INDEX IF NOT EXISTS message_thread_created_idx ON message(thread_id,created_at);
