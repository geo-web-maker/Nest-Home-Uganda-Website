import type { DraftPayload, DraftResponse, MailMessageView } from './types';

type HttpClient = {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
};

export function createMailApi(client: HttpClient) {
  return {
    readMessage: (mailboxMessageId: string) =>
      client.get<MailMessageView>(`/mail/messages/${encodeURIComponent(mailboxMessageId)}`),
    createDraft: (payload: DraftPayload) => client.post<DraftResponse>('/mail/drafts', payload),
    updateDraft: (id: string, payload: DraftPayload) =>
      client.put<DraftResponse>(`/mail/drafts/${encodeURIComponent(id)}`, payload),
    sendDraft: (id: string, mailboxId: string) =>
      client.post<{ message_id: string; local_deliveries: number; external_queued: number }>(
        `/mail/drafts/${encodeURIComponent(id)}/send`,
        { mailbox_id: mailboxId },
      ),
    attachmentDownload: (id: string) =>
      client.get<{ download_url: string; filename: string; expires_seconds: number }>(
        `/mail/attachments/${encodeURIComponent(id)}/download`,
      ),
    originalDownload: (mailboxMessageId: string) =>
      client.get<{ download_url: string; filename: string; expires_seconds: number }>(
        `/mail/messages/${encodeURIComponent(mailboxMessageId)}/original`,
      ),
  };
}
