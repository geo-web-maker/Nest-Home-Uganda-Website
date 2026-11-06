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

export class AttachmentUploadError extends Error {
  constructor(
    message: string,
    public readonly stage: 'reserve' | 'storage_upload' | 'confirm' | 'attach_to_draft',
    public readonly status?: number,
    public readonly requestId?: string,
  ) { super(message); this.name = 'AttachmentUploadError'; }
}

async function storageError(response: Response): Promise<AttachmentUploadError> {
  const raw = await response.text().catch(() => '');
  let body: { error?: { code?: string; message?: string; request_id?: string }; detail?: unknown; message?: string } | null = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { /* storage may return plain text */ }
  const detail = typeof body?.detail === 'string' ? body.detail : undefined;
  const message = body?.error?.message || body?.message || detail || raw.slice(0, 400) || response.statusText || 'Storage service rejected the upload.';
  return new AttachmentUploadError(
    `File storage rejected the upload (HTTP ${response.status}): ${message}. Check the signed upload URL, expiry, storage permissions, file size limit and CORS PUT rules.`,
    'storage_upload', response.status,
    body?.error?.request_id || response.headers.get('X-Request-ID') || undefined,
  );
}

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
      let reservation: UploadReservation;
      try {
        reservation = await client.post<UploadReservation>('/mail/attachments/presign', {
          mailbox_id: mailboxId,
          filename: file.name,
          content_type: contentType,
          size_bytes: file.size,
        });
      } catch (cause) {
        throw new AttachmentUploadError(`Could not reserve an attachment upload for "${file.name}" (${file.size} bytes). ${cause instanceof Error ? cause.message : String(cause)}`, 'reserve');
      }
      let response: Response;
      try {
        response = await fetch(reservation.upload_url, {
          method: 'PUT',
          headers: { 'Content-Type': contentType },
          body: file,
        });
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        throw new AttachmentUploadError(`Could not transfer "${file.name}" to the file-storage service. No HTTP response was received. This usually indicates an expired/invalid signed URL, blocked storage CORS, DNS/TLS failure, or interrupted connection. Browser detail: ${reason}.`, 'storage_upload');
      }
      if (!response.ok) throw await storageError(response);
      let confirmation: UploadConfirmation;
      try {
        confirmation = await client.post<UploadConfirmation>(
          `/mail/attachments/${encodeURIComponent(reservation.attachment_id)}/confirm`, {},
        );
      } catch (cause) {
        throw new AttachmentUploadError(`The file "${file.name}" reached storage, but the server could not verify its checksum/scan status. ${cause instanceof Error ? cause.message : String(cause)}`, 'confirm');
      }
      const contentId = disposition === 'inline'
        ? (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`)
        : null;
      try {
        await client.post(
          `/mail/drafts/${encodeURIComponent(draftId)}/attachments/${encodeURIComponent(reservation.attachment_id)}`,
          { disposition, content_id: contentId },
        );
      } catch (cause) {
        throw new AttachmentUploadError(`The file "${file.name}" is stored and verified, but could not be linked to draft ${draftId}. ${cause instanceof Error ? cause.message : String(cause)}`, 'attach_to_draft');
      }
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
      setError(cause instanceof Error ? cause.message : `Attachment upload failed during an unknown stage for ${file.name}.`);
      throw cause;
    } finally {
      setBusy(false);
    }
  }, [client]);

  return { upload, busy, error, clearError: () => setError(null) };
}
