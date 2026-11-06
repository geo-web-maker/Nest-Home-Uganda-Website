/* GENERATED from shared/mail-rich. Edit there, then run: node scripts/sync-mail-rich.mjs */
import { useEffect, useRef, useState } from 'react';
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
  actions,
}: {
  message: Message;
  onDownload: (attachment: MailAttachment) => void;
  onDownloadOriginal?: () => void;
  onExternalLink?: (url: string, hostname: string) => void;
  showRemoteImages?: (message: Message) => void;
  /** Re-queues a deferred or failed send; the host calls the API and refreshes the message. */
  onRetryDelivery?: () => Promise<void> | void;
  /** Extra rows for the More menu, such as Forward, Star or Move to trash. */
  actions?: { key: string; label: string; onSelect: () => void; disabled?: boolean }[];
}) {
  const { kit, labels } = useMailUi();
  const [formatted, setFormatted] = useState(Boolean(message.body_html || message.quoted_html));
  const [remoteImagesEnabled, setRemoteImagesEnabled] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (event: Event) => { if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [menuOpen]);
  const notes = message.render_notes ?? {};
  const hasRichBody = Boolean(message.body_html);
  const showImagesStrip = Boolean(message.has_remote_images && showRemoteImages && !remoteImagesEnabled);
  const menuActions = actions ?? [];
  const hasMore = menuActions.length > 0 || hasRichBody || Boolean(notes.signed) || Boolean(message.can_download_original && onDownloadOriginal);
  return (
    <article className="mr-message">
      {showImagesStrip || hasMore ? (
        <div className="mr-message-bar">
          {showImagesStrip ? (
            <div className="mr-strip" role="status">
              <span>{labels.remoteImagesBlocked}</span>
              <button type="button" className="mr-link-button" onClick={() => { setRemoteImagesEnabled(true); showRemoteImages?.(message); }}>{labels.showImages}</button>
            </div>
          ) : <span />}
          {hasMore ? (
            <div className="mr-more" ref={menuRef}>
              <button type="button" className="mr-more-trigger" aria-haspopup="menu" aria-expanded={menuOpen} aria-label={labels.moreOptions} title={labels.moreOptions} onClick={() => setMenuOpen((open) => !open)}><span aria-hidden="true">⋯</span></button>
              {menuOpen ? (
                <ul className="mr-menu" role="menu" aria-label={labels.moreOptions}>
                  {menuActions.map((action) => (
                    <li role="none" key={action.key}><button type="button" role="menuitem" disabled={action.disabled} onClick={() => { setMenuOpen(false); action.onSelect(); }}><span className="mr-menu-check" aria-hidden="true" />{action.label}</button></li>
                  ))}
                  {hasRichBody ? (
                    <>
                      <li role="none" className={menuActions.length ? 'mr-menu-sep' : undefined}><button type="button" role="menuitemradio" aria-checked={formatted} onClick={() => { setFormatted(true); setMenuOpen(false); }}><span className="mr-menu-check" aria-hidden="true">{formatted ? '✓' : ''}</span>{labels.formatted}</button></li>
                      <li role="none"><button type="button" role="menuitemradio" aria-checked={!formatted} onClick={() => { setFormatted(false); setMenuOpen(false); }}><span className="mr-menu-check" aria-hidden="true">{!formatted ? '✓' : ''}</span>{labels.plainText}</button></li>
                    </>
                  ) : null}
                  {message.can_download_original && onDownloadOriginal ? (
                    <li role="none" className={hasRichBody || menuActions.length ? 'mr-menu-sep' : undefined}><button type="button" role="menuitem" onClick={() => { onDownloadOriginal(); setMenuOpen(false); }}><span className="mr-menu-check" aria-hidden="true" />{labels.downloadOriginal}</button></li>
                  ) : null}
                  {notes.signed ? <li role="none" className="mr-menu-note">{labels.signedMessage}</li> : null}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
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
        return <section className="mr-delivery" aria-label={labels.delivery} aria-live="polite" data-attention={failures.length || message.delivery.state === 'failed' || message.delivery.state === 'deferred' || delayed ? 'true' : undefined}>
          <p><span className="mr-delivery-label">{labels.delivery}</span> <strong>{status}</strong>{failures.length && recipientEvents.some((item) => item.event === 'delivered') ? ' — Some recipients did not accept the message.' : ''}{message.delivery.reason ? ` — ${message.delivery.reason}` : ''}</p>
          {message.delivery.detail ? <p className="mr-delivery-error"><strong>{labels.deliveryError}:</strong> <code>{message.delivery.detail}</code></p> : null}
          {message.delivery.attempts || message.delivery.next_attempt_at ? <p className="mr-delivery-meta">
            {message.delivery.attempts ? `${labels.attemptsLabel}: ${message.delivery.attempts}` : ''}
            {message.delivery.attempts && message.delivery.next_attempt_at ? ' · ' : ''}
            {message.delivery.next_attempt_at ? `${labels.nextTry}: ${new Date(message.delivery.next_attempt_at).toLocaleString()}` : ''}
          </p> : null}
          {message.delivery.can_retry && onRetryDelivery ? <kit.Button variant="quiet" disabled={retrying} onClick={async () => { setRetrying(true); try { await onRetryDelivery(); } finally { setRetrying(false); } }}>{retrying ? labels.retrying : labels.retryNow}</kit.Button> : null}
          {recipientEvents.length ? <details className="mr-recipients"><summary>{labels.to} ({recipientEvents.length})</summary><ul>{recipientEvents.map((recipient) => <li key={`${recipient.address}:${recipient.event}`}>{recipient.address}: {recipient.event.replace(/_/g, ' ')}{recipient.at ? ` · ${new Date(recipient.at).toLocaleString()}` : ''}</li>)}</ul></details> : null}
        </section>;
      })() : null}
    </article>
  );
}
