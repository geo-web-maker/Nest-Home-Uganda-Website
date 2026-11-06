-- Replies look up their parent by Message-ID header; without this index every lookup scans the whole message table.
CREATE INDEX IF NOT EXISTS message_header_idx ON message (message_id_header) WHERE message_id_header IS NOT NULL;
