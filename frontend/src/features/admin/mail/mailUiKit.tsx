import type { ReactNode } from 'react';
import { Modal } from '../../../components/admin/Modal';
import { Notice } from '../../../components/admin/Notice';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { MailUiKitProvider, type MailLabels, type MailUiKit } from '../../../shared/mail-rich/react/MailUiKit';

const kit: MailUiKit = {
  Button: ({ children, onClick, variant = 'primary', disabled, busy, ariaLabel, type = 'button' }) => (
    <Button type={type} variant={variant === 'quiet' ? 'outline' : 'primary'} disabled={disabled || busy} aria-label={ariaLabel} onClick={onClick}>{children}</Button>
  ),
  ToolbarButton: ({ label, pressed, disabled, tabIndex, onFocus, onClick, children }) => (
    <Button variant="outline" size="compact" className="mr-editor-tool" aria-label={label} aria-pressed={pressed} tabIndex={tabIndex} disabled={disabled} onFocus={onFocus} onClick={onClick}>{children}</Button>
  ),
  Select: ({ label, value, options, onChange, compact }) => (
    <label className="mr-kit-field">{label}<select value={value} data-compact={compact ? 'true' : 'false'} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
  ),
  TextField: ({ label, value, onChange, error, autoFocus, inputMode, type = 'text' }) => (
    <Field label={label} type={type} value={value} error={error} autoFocus={autoFocus} inputMode={inputMode} onChange={(event) => onChange(event.target.value)} />
  ),
  ColorField: ({ label, value, onChange, variant = 'text', disabled }) => (
    <label className="mr-colour-tool" title={label} data-variant={variant} data-disabled={disabled ? 'true' : undefined} style={{ ['--swatch' as string]: value }}>
      <span className="mr-colour-glyph" aria-hidden="true">{variant === 'highlight' ? 'ab' : 'A'}</span>
      <input type="color" aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  ),
  Dialog: ({ id, title, closeLabel, onClose, children, actions, urgent, className }) => (
    <Modal id={id} title={title} closeLabel={closeLabel} onClose={onClose} role={urgent ? 'alertdialog' : 'dialog'} className={className}>{children}{actions}</Modal>
  ),
  Notice: ({ tone, children }) => <Notice tone={tone === 'error' ? 'error' : tone === 'success' ? 'success' : 'info'}>{children}</Notice>,
};

const defaults: MailLabels = {
  attachments: 'Attachments', download: 'Download', blockedAttachment: 'Blocked: a virus was found',
  attachmentUnavailable: 'Attachment unavailable', remoteImagesBlocked: 'Remote images are hidden to protect your privacy.',
  showImages: 'Show images', originalMessage: 'Original message', downloadOriginal: 'Download original message',
  formatted: 'Formatted', plainText: 'Plain text', from: 'From', to: 'To', cc: 'Cc', date: 'Date',
  signedMessage: 'This message has a digital signature.', renderingNotice: 'Some unsafe or unsupported content was removed.',
  scanning: 'Scanning…', scannedClean: 'Scanned: no threats found', notScanned: 'Not scanned', delivery: 'Delivery status',
  delivered: 'Delivered', bounced: 'Bounced', deferred: 'Deferred', sent: 'Sent', failed: 'Failed',
  retryNow: 'Retry now', retrying: 'Retrying…', deliveryError: 'Error', attemptsLabel: 'Attempts', nextTry: 'Next try',
  messageFormatting: 'Message formatting', bold: 'Bold', italic: 'Italic', underline: 'Underline',
  strikethrough: 'Strikethrough', bulletedList: 'Bulleted list', numberedList: 'Numbered list',
  blockQuote: 'Block quote', insertEditLink: 'Insert or edit link', insertTable: 'Insert table',
  insertHorizontalRule: 'Insert horizontal rule', clearFormatting: 'Clear formatting',
  addTableRow: 'Add table row', addTableColumn: 'Add table column', deleteTable: 'Delete table',
  alignLeft: 'Align left', alignCenter: 'Align center', alignRight: 'Align right',
  increaseIndent: 'Increase indent', decreaseIndent: 'Decrease indent', undo: 'Undo', redo: 'Redo',
  paragraphStyle: 'Paragraph style', paragraph: 'Paragraph', heading1: 'Heading 1', heading2: 'Heading 2',
  heading3: 'Heading 3', heading4: 'Heading 4', fontSize: 'Font size', textColour: 'Text colour',
  highlight: 'Highlight', insertLinkTitle: 'Insert link', webAddress: 'Web address, email or phone',
  allowedLinkHint: 'Allowed links start with https://, http://, mailto: or tel:', applyLink: 'Apply link',
  removeLink: 'Remove link', cancel: 'Cancel', tableTitle: 'Insert table', rows: 'Rows (1–10)',
  columns: 'Columns (1–8)', removeQuoteTitle: 'Remove original message?',
  removeQuoteHint: 'The quoted original will not be included in this reply.',
  keepQuote: 'Keep quoted message', removeQuote: 'Remove quote',
  showQuotedMessage: 'Show original message', hideQuotedMessage: 'Hide original message',
};

export function AdminMailUiProvider({ children, labels }: { children: ReactNode; labels?: Partial<MailLabels> }) {
  return <MailUiKitProvider kit={kit} labels={{ ...defaults, ...labels }}>{children}</MailUiKitProvider>;
}
