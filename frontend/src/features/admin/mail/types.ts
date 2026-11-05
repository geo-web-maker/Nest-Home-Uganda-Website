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
  body_text?: string;
  body_format?: 'plain' | 'html';
  snippet?: string;
  has_attachments?: boolean;
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
  sha256?: string | null;
  disposition?: 'attachment' | 'inline';
  content_id?: string | null;
  blocked_reason?: string | null;
  scan_detail?: string | null;
  scanned_at?: string | null;
};

/** What GET /mail/messages/{id} adds on top of the list row. */
export type MailDetail = {
  mailbox_message_id: string;
  message_id: string;
  from_address: string;
  from_name?: string | null;
  subject: string;
  body_text: string;
  body_html?: string | null;
  quoted_html?: string | null;
  body_format?: 'plain' | 'html';
  snippet?: string;
  has_remote_images?: boolean;
  can_download_original?: boolean;
  render_notes?: Record<string, unknown>;
  origin: string;
  is_read: boolean;
  is_starred: boolean;
  folder: string;
  recipients: MailRecipient[];
  attachments: MailAttachment[];
  delivery?: { state: string; reason?: string | null; provider?: string; recipients: { address: string; event: string; at?: string | null }[] } | null;
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
  bodyHtml?: string;
  bodyFormat?: 'plain' | 'html';
  quotedHtml?: string | null;
  attachments?: { id: string; filename: string; size: number; content_type?: string; scan_state?: string; blocked_reason?: string | null; disposition?: 'attachment' | 'inline'; content_id?: string | null }[];
  quote?: { kind: 'reply' | 'reply_all' | 'forward' | 'forward_attachment'; source_id: string; include_attachments?: boolean };
};
