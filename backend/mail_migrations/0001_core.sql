-- Nest Mail core schema. Safe to execute once by the numbered migration runner.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mailbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_part citext NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('personal','shared')),
  owner_user_id text,
  display_name text NOT NULL,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed')),
  external_allowed boolean,
  sending_suspended boolean NOT NULL DEFAULT false,
  legal_hold boolean NOT NULL DEFAULT false,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mailbox_owner_kind_check CHECK (
    (kind = 'personal' AND owner_user_id IS NOT NULL) OR
    (kind = 'shared' AND owner_user_id IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS mailbox_one_personal_per_user_idx
  ON mailbox (owner_user_id) WHERE kind = 'personal';
CREATE INDEX IF NOT EXISTS mailbox_state_idx ON mailbox (state, closed_at);

CREATE TABLE IF NOT EXISTS mailbox_alias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES mailbox(id),
  local_part citext NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mailbox_alias_mailbox_idx ON mailbox_alias (mailbox_id);

CREATE TABLE IF NOT EXISTS mailbox_member (
  mailbox_id uuid NOT NULL REFERENCES mailbox(id),
  user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','send_as','read_only')),
  added_by text NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mailbox_id, user_id)
);
CREATE INDEX IF NOT EXISTS mailbox_member_user_idx ON mailbox_member (user_id, mailbox_id);

CREATE TABLE IF NOT EXISTS message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid,
  message_id_header text,
  in_reply_to text,
  from_address text NOT NULL,
  from_name text,
  subject text NOT NULL DEFAULT '',
  body_text text NOT NULL DEFAULT '',
  body_html text,
  origin text NOT NULL CHECK (origin IN ('internal','outbound','inbound')),
  size_bytes bigint NOT NULL DEFAULT 0,
  spam_score numeric,
  auth_results jsonb,
  raw_object_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  search tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(subject,'') || ' ' || coalesce(body_text,'') || ' ' || coalesce(from_address,''))
  ) STORED
);
CREATE INDEX IF NOT EXISTS message_search_idx ON message USING gin (search);
CREATE INDEX IF NOT EXISTS message_thread_idx ON message (thread_id, created_at);

CREATE TABLE IF NOT EXISTS message_recipient (
  message_id uuid NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('to','cc','bcc')),
  address text NOT NULL,
  name text,
  mailbox_id uuid REFERENCES mailbox(id),
  PRIMARY KEY (message_id, kind, address)
);
CREATE INDEX IF NOT EXISTS message_recipient_mailbox_idx ON message_recipient (mailbox_id, message_id);

CREATE TABLE IF NOT EXISTS mailbox_message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES mailbox(id),
  message_id uuid NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  folder text NOT NULL CHECK (folder IN ('inbox','sent','drafts','trash','spam')),
  is_read boolean NOT NULL DEFAULT false,
  is_starred boolean NOT NULL DEFAULT false,
  trashed_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mailbox_id, message_id, folder)
);
CREATE INDEX IF NOT EXISTS mailbox_message_list_idx
  ON mailbox_message (mailbox_id, folder, received_at DESC);
CREATE INDEX IF NOT EXISTS mailbox_message_unread_idx
  ON mailbox_message (mailbox_id, folder) WHERE is_read = false;

CREATE TABLE IF NOT EXISTS attachment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES message(id) ON DELETE CASCADE,
  uploader_mailbox_id uuid REFERENCES mailbox(id),
  object_key text NOT NULL,
  filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  scan_state text NOT NULL DEFAULT 'unscanned',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attachment_message_idx ON attachment (message_id);

CREATE TABLE IF NOT EXISTS outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES message(id),
  from_mailbox_id uuid REFERENCES mailbox(id),
  to_addresses text[] NOT NULL,
  priority smallint NOT NULL DEFAULT 5,
  state text NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued','sending','sent','deferred','failed','cancelled')),
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL UNIQUE,
  provider text,
  provider_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS outbox_due_idx ON outbox (state, next_attempt_at, priority);

CREATE TABLE IF NOT EXISTS suppression (
  address citext PRIMARY KEY,
  reason text NOT NULL CHECK (reason IN ('hard_bounce','complaint','manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS send_counter (
  scope text NOT NULL,
  window_kind text NOT NULL CHECK (window_kind IN ('day','month')),
  window_start date NOT NULL,
  count int NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, window_kind, window_start)
);

CREATE TABLE IF NOT EXISTS mail_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  is_secret boolean NOT NULL DEFAULT false,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mail_audit (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_user_id text,
  action text NOT NULL,
  mailbox_id uuid,
  message_id uuid,
  detail jsonb,
  ip_hash text
);
CREATE INDEX IF NOT EXISTS mail_audit_time_idx ON mail_audit (at DESC);
CREATE INDEX IF NOT EXISTS mail_audit_actor_idx ON mail_audit (actor_user_id, at DESC);

CREATE TABLE IF NOT EXISTS totp_secret (
  user_id text PRIMARY KEY,
  secret_encrypted bytea NOT NULL,
  confirmed_at timestamptz,
  recovery_hashes text[] NOT NULL DEFAULT '{}'
);

-- A database-level guard prevents a mailbox and an alias from sharing the same address.
-- The advisory lock makes the check race-safe across concurrent mailbox allocations.
CREATE OR REPLACE FUNCTION mail_guard_address_namespace() RETURNS trigger AS $$
DECLARE
  address_key text := lower(NEW.local_part::text);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(address_key, 0));
  IF TG_TABLE_NAME = 'mailbox' THEN
    IF EXISTS (SELECT 1 FROM mailbox_alias WHERE lower(local_part::text) = address_key) THEN
      RAISE EXCEPTION 'mail address is already reserved' USING ERRCODE = '23505';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM mailbox WHERE lower(local_part::text) = address_key) THEN
      RAISE EXCEPTION 'mail address is already reserved' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mailbox_address_namespace_guard ON mailbox;
CREATE TRIGGER mailbox_address_namespace_guard BEFORE INSERT OR UPDATE OF local_part ON mailbox
  FOR EACH ROW EXECUTE FUNCTION mail_guard_address_namespace();
DROP TRIGGER IF EXISTS mailbox_alias_namespace_guard ON mailbox_alias;
CREATE TRIGGER mailbox_alias_namespace_guard BEFORE INSERT OR UPDATE OF local_part ON mailbox_alias
  FOR EACH ROW EXECUTE FUNCTION mail_guard_address_namespace();
