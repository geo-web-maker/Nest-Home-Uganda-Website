-- Show earlier system emails (agreements, invites, resets) in the shared no-reply mailbox's Sent folder.
-- Idempotent: UNIQUE (mailbox_id, message_id, folder) makes re-runs no-ops.
INSERT INTO mailbox_message (mailbox_id, message_id, folder, is_read, received_at)
SELECT o.from_mailbox_id, o.message_id, 'sent', true, o.created_at
FROM outbox o
JOIN mailbox b ON b.id = o.from_mailbox_id
WHERE b.local_part = 'no-reply'
ON CONFLICT DO NOTHING;
