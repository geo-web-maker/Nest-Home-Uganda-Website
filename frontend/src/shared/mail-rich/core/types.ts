/* GENERATED from shared/mail-rich. Edit there, then run: node scripts/sync-mail-rich.mjs */
export type MailFormat = 'plain' | 'html';
export type RecipientKind = 'to' | 'cc' | 'bcc';

export type MailRecipient = {
  kind: RecipientKind;
  address: string;
  name?: string | null;
};

export type MailAttachment = {
  id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  sha256?: string | null;
  scan_state: string;
  disposition: 'attachment' | 'inline';
  content_id?: string | null;
  blocked_reason?: string | null;
  scan_detail?: string | null;
  scanned_at?: string | null;
};

export type RenderNotes = {
  removed_tags?: Record<string, number>;
  removed_attributes?: number;
  removed_style_properties?: number;
  blocked_remote_images?: number;
  missing_inline_image?: number;
  inline_images_not_embedded?: number;
  truncated?: boolean;
  depth_exceeded?: boolean;
  failed?: boolean;
  [key: string]: unknown;
};

export type MailMessageView = {
  mailbox_message_id: string;
  message_id: string;
  folder: string;
  from_address: string;
  from_name?: string | null;
  subject: string;
  body_format: MailFormat;
  body_text: string;
  body_html?: string | null;
  quoted_html?: string | null;
  snippet: string;
  recipients: MailRecipient[];
  attachments: MailAttachment[];
  render_notes: RenderNotes;
  has_remote_images: boolean;
  can_download_original: boolean;
  delivery?: { state: string; reason?: string | null; provider?: string; recipients: { address: string; event: string; at?: string | null }[] } | null;
};

export type DraftPayload = {
  mailbox_id: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  format: MailFormat;
  body_text: string;
  body_html?: string | null;
  in_reply_to?: string | null;
  quote?: QuoteRequest | null;
  remove_quote?: boolean;
};

export type QuoteRequest = {
  kind: 'reply' | 'reply_all' | 'forward' | 'forward_attachment';
  source_id: string;
  include_attachments?: boolean;
};

export type DraftResponse = {
  id: string;
  message_id: string;
  status: 'draft';
  body_html?: string | null;
  body_text: string;
  quoted_html?: string | null;
  attachments: MailAttachment[];
};
