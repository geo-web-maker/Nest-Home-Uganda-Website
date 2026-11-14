-- Test accounts: their mailboxes only exchange mail with each other; external sends go to the console sink.
ALTER TABLE mailbox ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
