import type { MailAttachment } from '../core/types';
import { attachmentStatus, attachmentTypeLabel } from '../core/attachments';
import { formatBytes } from '../core/bytes';
import { useMailUi } from './MailUiKit';

export function AttachmentList({
  attachments,
  onDownload,
  onRemove,
  actionLabel,
}: {
  attachments: MailAttachment[];
  onDownload?: (attachment: MailAttachment) => void;
  onRemove?: (attachment: MailAttachment) => void;
  actionLabel?: string;
}) {
  const { kit, labels } = useMailUi();
  if (!attachments.length) return null;
  return (
    <section className="mr-attachments" aria-label={labels.attachments}>
      <h3 className="mr-section-title">{labels.attachments}</h3>
      <ul className="mr-attachment-list">
        {attachments.map((attachment) => {
          const status = attachmentStatus(attachment);
          return (
            <li className="mr-attachment" key={attachment.id}>
              <span className="mr-file-type" aria-hidden="true">{attachmentTypeLabel(attachment.content_type)}</span>
              <span className="mr-attachment-copy">
                <strong>{attachment.filename}</strong>
                <small>{formatBytes(attachment.size_bytes)}</small>
                {status === 'blocked' ? <small role="status">{labels.blockedAttachment}</small> : null}
                {status !== 'blocked' && attachment.scan_state === 'pending' ? <small role="status">{labels.scanning}</small> : null}
                {status !== 'blocked' && attachment.scan_state === 'clean' ? <small>{labels.scannedClean}</small> : null}
                {status !== 'blocked' && ['unscanned', 'scan_error'].includes(attachment.scan_state) ? <small>{labels.notScanned}</small> : null}
              </span>
              {onRemove ? (
                <kit.Button variant="quiet" ariaLabel={`${actionLabel ?? 'Remove'} ${attachment.filename}`} onClick={() => onRemove(attachment)}>{actionLabel ?? 'Remove'}</kit.Button>
              ) : onDownload ? (
                <kit.Button variant="quiet" disabled={status !== 'available'} onClick={() => onDownload(attachment)}>
                  {labels.download}
                </kit.Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
