import { useEffect, useRef, type ReactNode } from 'react';
import { Banner } from '../../ui/Banner';
import { PillButton } from '../../ui/PillButton';
import { Sheet } from '../../ui/Sheet';
import { MailUiKitProvider, type MailLabels, type MailUiKit } from '../../shared/mail-rich/react/MailUiKit';


function NurseMailDialog({ id, title, closeLabel, onClose, children, actions, urgent, className }: {
  id: string; title: string; closeLabel: string; onClose: () => void; children: ReactNode;
  actions?: ReactNode; urgent?: boolean; className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = root.current?.querySelector<HTMLElement>('section.sheet');
    dialog?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('section.sheet'));
      if (dialogs[dialogs.length - 1] === dialog) {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, []);
  return <div ref={root}><Sheet labelledBy={id} role={urgent ? 'alertdialog' : 'dialog'} placement="center" className={className} tabIndex={-1}>
    <h2 id={id}>{title}</h2>{children}{actions}
    <PillButton type="button" tone="ghost" showArrow={false} onClick={onClose}>{closeLabel}</PillButton>
  </Sheet></div>;
}

const kit: MailUiKit = {
  Button: ({ children, onClick, variant = 'primary', disabled, busy, ariaLabel, type = 'button' }) => (
    <PillButton type={type} tone={variant === 'quiet' ? 'ghost' : 'forest'} size="sm" showArrow={false} disabled={disabled || busy} aria-label={ariaLabel} onClick={onClick}>{children}</PillButton>
  ),
  ToolbarButton: ({ label, pressed, disabled, tabIndex, onFocus, onClick, children }) => (
    <PillButton type="button" tone={pressed ? 'forest' : 'ghost'} size="sm" className="mr-editor-tool" showArrow={false} aria-label={label} aria-pressed={pressed} tabIndex={tabIndex} disabled={disabled} onFocus={onFocus} onClick={onClick}>{children}</PillButton>
  ),
  Select: ({ label, value, options, onChange }) => (
    <label className="mr-kit-field">{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
  ),
  TextField: ({ label, value, onChange, error, autoFocus, inputMode, type = 'text' }) => (
    <label className="mr-kit-field">{label}<input type={type} value={value} autoFocus={autoFocus} inputMode={inputMode} aria-invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)} />{error ? <span role="alert">{error}</span> : null}</label>
  ),
  ColorField: ({ label, value, onChange }) => (
    <label className="mr-kit-field">{label}<input type="color" value={value} onChange={(event) => onChange(event.target.value)} /></label>
  ),
  Dialog: NurseMailDialog,
  Notice: ({ tone, children }) => <Banner tone={tone === 'error' ? 'bad' : tone === 'warning' ? 'warn' : tone === 'success' ? 'ok' : 'info'}>{children}</Banner>,
};

const defaults: MailLabels = {
  attachments: 'Attachments', download: 'Download', blockedAttachment: 'Blocked: a virus was found',
  attachmentUnavailable: 'Attachment unavailable', remoteImagesBlocked: 'Remote images are hidden to protect your privacy.',
  showImages: 'Show images', originalMessage: 'Original message', downloadOriginal: 'Download original message',
  formatted: 'Formatted', plainText: 'Plain text', from: 'From', to: 'To', cc: 'Cc', date: 'Date',
  signedMessage: 'This message has a digital signature.', renderingNotice: 'Some unsafe or unsupported content was removed.',
  scanning: 'Scanning…', scannedClean: 'Scanned: no threats found', notScanned: 'Not scanned', delivery: 'Delivery status',
  delivered: 'Delivered', bounced: 'Bounced', deferred: 'Deferred', sent: 'Sent', failed: 'Failed',
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

export function NurseMailUiProvider({ children }: { children: ReactNode }) {
  return <MailUiKitProvider kit={kit} labels={defaults}>{children}</MailUiKitProvider>;
}
