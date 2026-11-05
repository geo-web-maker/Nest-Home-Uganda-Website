-- Rich content, inline images, forwarding metadata and separate outbound recipient kinds.
ALTER TABLE message
  ADD COLUMN IF NOT EXISTS body_format text NOT NULL DEFAULT 'plain'
    CHECK (body_format IN ('plain', 'html')),
  ADD COLUMN IF NOT EXISTS quoted_html text,
  ADD COLUMN IF NOT EXISTS quote_kind text CHECK (quote_kind IN ('reply', 'forward')),
  ADD COLUMN IF NOT EXISTS quote_source_message_id uuid REFERENCES message(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS snippet text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS render_notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sanitizer_version smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS references_header text,
  ADD COLUMN IF NOT EXISTS sent_eml_key text;

UPDATE message SET snippet = left(regexp_replace(coalesce(body_text, ''), '\s+', ' ', 'g'), 160)
WHERE snippet = '';

ALTER TABLE attachment
  ADD COLUMN IF NOT EXISTS content_id text,
  ADD COLUMN IF NOT EXISTS disposition text NOT NULL DEFAULT 'attachment'
    CHECK (disposition IN ('attachment', 'inline')),
  ADD COLUMN IF NOT EXISTS source_attachment_id uuid REFERENCES attachment(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS blocked_reason text;
ALTER TABLE attachment ALTER COLUMN object_key DROP NOT NULL;
CREATE INDEX IF NOT EXISTS attachment_content_id_idx
  ON attachment (message_id, content_id) WHERE content_id IS NOT NULL;

ALTER TABLE outbox
  ADD COLUMN IF NOT EXISTS cc_addresses text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bcc_addresses text[] NOT NULL DEFAULT '{}';
