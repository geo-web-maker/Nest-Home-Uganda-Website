/* GENERATED from shared/mail-rich. Edit there, then run: node scripts/sync-mail-rich.mjs */
import { useState } from 'react';
import type { MailAttachment, MailMessageView as Message } from '../core/types';
import { AttachmentList } from './AttachmentList';
import { useMailUi } from './MailUiKit';
import { SafeHtml } from './SafeHtml';

export function MailMessageView({
  message,
  onDownload,
  onDownloadOriginal,
  onExternalLink,
  showRemoteImages,
  onRetryDelivery,
}: {
  message: Message;
  onDownload: (attachment: MailAttachment) => void;
  onDownloadOriginal?: () => void;
  onExternalLink?: (url: string, hostname: string) => void;
  showRemoteImages?: (message: Message) => void;
  /** Re-queues a deferred or failed send; the host calls the API and refreshes the message. */
  onRetryDelivery?: () => Promise<void> | void;
}) {
  const { kit, labels } = useMailUi();
  const [formatted, setFormatted] = useState(Boolean(message.body_html || message.quoted_html));
  const [remoteImagesEnabled, setRemoteImagesEnabled] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const notes = message.render_notes ?? {};
  const renderWarning = Boolean(
    notes.truncated || notes.depth_exceeded || notes.failed || notes.removed_tags,
  );
  return (
    <article className="mr-message">
      {message.has_remote_images ? (
        <kit.Notice tone="warning">
          <span>{labels.remoteImagesBlocked}</span>
          {showRemoteImages ? (
            <kit.Button variant="quiet" onClick={() => { setRemoteImagesEnabled(true); showRemoteImages(message); }}>{labels.showImages}</kit.Button>
          ) : null}
        </kit.Notice>
      ) : null}
      {renderWarning ? <kit.Notice tone="warning">{labels.renderingNotice}</kit.Notice> : null}
      {notes.signed ? <kit.Notice tone="info">{labels.signedMessage}</kit.Notice> : null}
      <div className="mr-message-toggle" role="group" aria-label={labels.formatted}>
        <kit.ToolbarButton label={labels.formatted} pressed={formatted} onClick={() => setFormatted(true)}>
          {labels.formatted}
        </kit.ToolbarButton>
        <kit.ToolbarButton label={labels.plainText} pressed={!formatted} onClick={() => setFormatted(false)}>
          {labels.plainText}
        </kit.ToolbarButton>
      </div>
      {formatted && message.body_html ? (
        <SafeHtml html={message.body_html} className="mr-paper" onExternalLink={onExternalLink} allowRemoteImages={remoteImagesEnabled} />
      ) : (
        <pre className="mr-plain-body">{message.body_text}</pre>
      )}
      {formatted && message.quoted_html ? (
        <SafeHtml html={message.quoted_html} className="mr-quoted" onExternalLink={onExternalLink} />
      ) : null}
      <AttachmentList attachments={message.attachments} onDownload={onDownload} />
      {message.delivery ? (() => {
        const recipientEvents = message.delivery.recipients;
        const failures = recipientEvents.filter((item) => ['hard_bounce', 'blocked', 'invalid_email', 'complaint', 'failed', 'error'].includes(item.event));
        const allDelivered = recipientEvents.length > 0 && recipientEvents.every((item) => item.event === 'delivered');
        const delayed = recipientEvents.some((item) => ['deferred', 'soft_bounce'].includes(item.event));
        const status = message.delivery.state === 'failed' ? labels.failed
          : failures.length ? labels.bounced
          : allDelivered ? labels.delivered
          : delayed || message.delivery.state === 'deferred' ? labels.deferred
          : message.delivery.state === 'sent' ? labels.sent : message.delivery.state;
        return <section className="mr-delivery" aria-label={labels.delivery} aria-live="polite">
          <h3 className="mr-section-title">{labels.delivery}</h3>
          <p><strong>{status}</strong>{failures.length && recipientEvents.some((item) => item.event === 'delivered') ? ' — Some recipients did not accept the message.' : ''}{message.delivery.reason ? ` — ${message.delivery.reason}` : ''}</p>
          {message.delivery.detail ? <p className="mr-delivery-error"><strong>{labels.deliveryError}:</strong> <code>{message.delivery.detail}</code></p> : null}
          {message.delivery.attempts || message.delivery.next_attempt_at ? <p className="mr-delivery-meta">
            {message.delivery.attempts ? `${labels.attemptsLabel}: ${message.delivery.attempts}` : ''}
            {message.delivery.attempts && message.delivery.next_attempt_at ? ' · ' : ''}
            {message.delivery.next_attempt_at ? `${labels.nextTry}: ${new Date(message.delivery.next_attempt_at).toLocaleString()}` : ''}
          </p> : null}
          {message.delivery.can_retry && onRetryDelivery ? <kit.Button variant="quiet" disabled={retrying} onClick={async () => { setRetrying(true); try { await onRetryDelivery(); } finally { setRetrying(false); } }}>{retrying ? labels.retrying : labels.retryNow}</kit.Button> : null}
          {recipientEvents.length ? <ul>{recipientEvents.map((recipient) => <li key={`${recipient.address}:${recipient.event}`}>{recipient.address}: {recipient.event.replace(/_/g, ' ')}{recipient.at ? ` · ${new Date(recipient.at).toLocaleString()}` : ''}</li>)}</ul> : null}
        </section>;
      })() : null}
      {message.can_download_original && onDownloadOriginal ? (
        <div className="mr-original-download">
          <kit.Button variant="quiet" onClick={onDownloadOriginal}>{labels.downloadOriginal}</kit.Button>
        </div>
      ) : null}
    </article>
  );
}
