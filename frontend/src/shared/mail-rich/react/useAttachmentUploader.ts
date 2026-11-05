/* GENERATED from shared/mail-rich. Edit there, then run: node scripts/sync-mail-rich.mjs */
import { useCallback, useState } from 'react';

type UploadReservation = {
  attachment_id: string;
  upload_url: string;
  expires_seconds: number;
};

type UploadConfirmation = {
  confirmed: boolean;
  sha256: string;
  scan_state: string;
};

type UploadResult = {
  id: string;
  filename: string;
  size_bytes: number;
  content_type: string;
  sha256: string;
  scan_state: string;
  disposition: 'attachment' | 'inline';
  content_id: string | null;
};

export function useAttachmentUploader(client: {
  post<T>(path: string, body: unknown): Promise<T>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(async (
    mailboxId: string,
    file: File,
    draftId: string,
    options: { disposition?: 'attachment' | 'inline' } = {},
  ): Promise<UploadResult> => {
    setBusy(true);
    setError(null);
    try {
      const contentType = file.type || 'application/octet-stream';
      const disposition = options.disposition ?? 'attachment';
      const reservation = await client.post<UploadReservation>('/mail/attachments/presign', {
        mailbox_id: mailboxId,
        filename: file.name,
        content_type: contentType,
        size_bytes: file.size,
      });
      const response = await fetch(reservation.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
      });
      if (!response.ok) throw new Error('Upload failed.');
      const confirmation = await client.post<UploadConfirmation>(
        `/mail/attachments/${encodeURIComponent(reservation.attachment_id)}/confirm`, {},
      );
      const contentId = disposition === 'inline'
        ? (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`)
        : null;
      await client.post(
        `/mail/drafts/${encodeURIComponent(draftId)}/attachments/${encodeURIComponent(reservation.attachment_id)}`,
        { disposition, content_id: contentId },
      );
      return {
        id: reservation.attachment_id,
        filename: file.name,
        size_bytes: file.size,
        content_type: contentType,
        sha256: confirmation.sha256,
        scan_state: confirmation.scan_state,
        disposition,
        content_id: contentId,
      };
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed.');
      throw cause;
    } finally {
      setBusy(false);
    }
  }, [client]);

  return { upload, busy, error, clearError: () => setError(null) };
}
