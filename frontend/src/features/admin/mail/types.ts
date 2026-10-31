export const FOLDERS = ['inbox', 'sent', 'drafts', 'trash', 'spam', 'starred'] as const;
export type Folder = (typeof FOLDERS)[number];

export type Mailbox = { id: string; address: string; display_name: string; unread_count: number };

export type MailItem = {
  mailbox_message_id: string;
  message_id: string;
  folder: string;
  from_address: string;
  from_name?: string | null;
  subject: string;
  body_text: string;
  origin: string;
  received_at: string;
  is_read: boolean;
  is_starred: boolean;
};

export type MailRecipient = { kind: 'to' | 'cc' | 'bcc'; address: string; name?: string | null };

export type MailAttachment = {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  scan_state: string;
};

/** What GET /mail/messages/{id} adds on top of the list row. */
export type MailDetail = {
  mailbox_message_id: string;
  message_id: string;
  from_address: string;
  from_name?: string | null;
  subject: string;
  body_text: string;
  origin: string;
  is_read: boolean;
  is_starred: boolean;
  folder: string;
  recipients: MailRecipient[];
  attachments: MailAttachment[];
};

export type ComposeSeed = {
  /** Set when an existing draft is being edited. */
  draftId?: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  inReplyTo?: string;
  /** Files already on the draft being edited. */
  attachments?: { id: string; filename: string; size: number }[];
};
