-- Optional Bloomwell letterhead: the outbox wraps the outgoing HTML/plain parts at send time.
ALTER TABLE message ADD COLUMN IF NOT EXISTS letterhead boolean NOT NULL DEFAULT false;
