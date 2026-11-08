import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { copy } from '../../copy';
import { Banner } from '../../ui/Banner';
import { PillButton } from '../../ui/PillButton';
import { Sheet, SheetActions } from '../../ui/Sheet';
import { AttachmentList } from '../../shared/mail-rich/react/AttachmentList';
import { NurseMailUiProvider } from './mailUiKit';
import type { MailAttachment, MailFormat } from '../../shared/mail-rich/core/types';

const LazyMailRichEditor = lazy(() => import('../../shared/mail-rich/react/MailRichEditor').then((module) => ({ default: module.MailRichEditor })));

export type ComposeState = {
  /** Local draft id; stays the same while the draft is edited, saved or retried. */
  id: string;
  mailboxId: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  bodyHtml?: string;
  bodyFormat?: MailFormat;
  quotedHtml?: string | null;
  removeQuote?: boolean;
  inReplyTo?: string;
  quote?: { kind: 'reply' | 'reply_all' | 'forward' | 'forward_attachment'; source_id: string; include_attachments?: boolean };
  serverDraftId?: string;
  attachments: (MailAttachment & { size: number })[];
};

type Props = {
  value: ComposeState;
  problem: string;
  onDismissProblem?: () => void;
  online: boolean;
  attaching: boolean;
  onAttach: (files: File[]) => void;
  onPasteImage: (file: File) => Promise<string | null>;
  onRemoveAttachment: (id: string) => void;
  onChange: (next: ComposeState) => void;
  onSend: () => void;
  onSaveDraft: () => void;
  onCancel: () => void;
  onDiscard: (value: ComposeState) => void;
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function plainToHtml(value: string): string {
  return value.split(/\r?\n/).map((line) => `<p>${line ? escapeHtml(line) : '<br>'}</p>`).join('');
}

/** Offline-capable composer with confirmation guards, a quoted-message boundary and a shared TipTap editor. */
export function MailComposeSheet({ value, problem, onDismissProblem, online, attaching, onAttach, onPasteImage, onRemoveAttachment, onChange, onSend, onSaveDraft, onCancel, onDiscard }: Props) {
  const first = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(onCancel);
  const initialSnapshot = useRef(JSON.stringify(value));
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [editorNotice, setEditorNotice] = useState('');
  const [format, setFormat] = useState<MailFormat>(value.bodyFormat ?? 'html');
  cancelRef.current = onCancel;
  const dirty = JSON.stringify(value) !== initialSnapshot.current;
  // The draft is already autosaved on this device, so closing keeps it instead of asking.
  const requestClose = () => { if (dirty) onSaveDraft(); else onCancel(); };

  useEffect(() => {
    initialSnapshot.current = JSON.stringify(value);
  }, [value.id]);

  useEffect(() => {
    setFormat(value.bodyFormat ?? 'html');
  }, [value.id, value.bodyFormat]);

  // Focus the first field once per draft. This must not depend on `value`, or every keystroke in the editor
  // would pull focus back to the To field.
  useEffect(() => {
    first.current?.focus();
  }, [value.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeConfirm) {
        const dialogs = document.querySelectorAll('section.sheet');
        if (dialogs.length > 1) return;
        if (JSON.stringify(value) !== initialSnapshot.current) onSaveDraft(); else cancelRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeConfirm, value, onSaveDraft]);

  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSend();
  };
  const hasRecipient = value.to.trim() !== '' || value.cc.trim() !== '' || value.bcc.trim() !== '';
  const bodyHasContent = format === 'html' ? (Boolean((value.bodyHtml ?? '').replace(/<[^>]+>/g, '').trim()) || /<(img|table)\b/i.test(value.bodyHtml ?? '')) : value.body.trim() !== '';
  const canSend = hasRecipient && value.subject.trim() !== '' && (bodyHasContent || Boolean(value.quote || value.quotedHtml)) && !attaching;
  const attachmentItems: MailAttachment[] = value.attachments.map(({ size: _size, ...file }) => file);

  // Switching to plain text never asks: the rich version is kept, and switching back restores it
  // as long as the plain text was not edited in between.
  const richBackup = useRef<{ html: string; text: string } | null>(null);
  const requestPlain = () => {
    const text = (value.bodyHtml ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    richBackup.current = { html: value.bodyHtml ?? '', text };
    onChange({ ...value, body: text, bodyHtml: undefined, bodyFormat: 'plain' });
    setFormat('plain');
  };
  const switchRich = () => {
    const backup = richBackup.current;
    onChange({ ...value, bodyHtml: backup && backup.text === value.body ? backup.html : plainToHtml(value.body), bodyFormat: 'html' });
    setFormat('html');
  };

  return <NurseMailUiProvider><Sheet labelledBy="mail-compose-title" className="mail-compose-sheet">
    <h2 id="mail-compose-title">{copy.mail.compose}</h2>
    <form onSubmit={submit} className="stack-form">
      <label htmlFor="mail-to">{copy.mail.to}</label>
      <input ref={first} id="mail-to" value={value.to} onChange={(event) => onChange({ ...value, to: event.target.value })} placeholder={copy.mail.toHint} autoComplete="off" aria-describedby={problem ? 'mail-problem' : undefined} aria-invalid={problem ? true : undefined} />
      <label htmlFor="mail-cc">{copy.mail.cc}</label>
      <input id="mail-cc" value={value.cc} onChange={(event) => onChange({ ...value, cc: event.target.value })} placeholder={copy.mail.toHint} autoComplete="off" />
      <label htmlFor="mail-bcc">{copy.mail.bcc}</label>
      <input id="mail-bcc" value={value.bcc} onChange={(event) => onChange({ ...value, bcc: event.target.value })} placeholder={copy.mail.toHint} autoComplete="off" />
      <label htmlFor="mail-subject">{copy.mail.subject}</label>
      <input id="mail-subject" value={value.subject} onChange={(event) => onChange({ ...value, subject: event.target.value })} />
      <div className="mr-composer-mode" role="group" aria-label="Message format">
        <PillButton type="button" tone={format === 'html' ? 'forest' : 'ghost'} size="sm" showArrow={false} aria-pressed={format === 'html'} onClick={switchRich}>Rich text</PillButton>
        <PillButton type="button" tone={format === 'plain' ? 'forest' : 'ghost'} size="sm" showArrow={false} aria-pressed={format === 'plain'} onClick={requestPlain}>Plain text</PillButton>
      </div>
      {format === 'html' ? <Suspense fallback={<p role="status">Loading editor…</p>}>
        <LazyMailRichEditor
          value={value.bodyHtml || plainToHtml(value.body)}
          onChange={(html, text) => onChange({ ...value, bodyHtml: html, body: text, bodyFormat: 'html' })}
          profile="lite"
          label={copy.mail.message}
          quotedHtml={value.quotedHtml && !value.removeQuote ? value.quotedHtml : null}
          quoteInitiallyExpanded={value.quote?.kind === 'forward' || value.quote?.kind === 'forward_attachment'}
          quoteLabel="Original message"
          removeQuoteLabel="Remove original message"
          onRemoveQuote={() => onChange({ ...value, quotedHtml: null, removeQuote: true })}
          onPasteImage={onPasteImage}
          onPasteFiles={onAttach}
          onPasteImageBlocked={() => setEditorNotice('This image could not be added inline; it will be offered as a normal attachment.')}
        />
      </Suspense> : <>
        <label htmlFor="mail-body">{copy.mail.message}</label>
        <textarea id="mail-body" rows={8} value={value.body} onChange={(event) => onChange({ ...value, body: event.target.value, bodyFormat: 'plain' })} />
      </>}
      {editorNotice ? <p role="status" className="mail-hint">{editorNotice}</p> : null}
      {attachmentItems.length ? <AttachmentList attachments={attachmentItems} onRemove={(attachment) => onRemoveAttachment(attachment.id)} actionLabel={copy.mail.remove} /> : null}
      <input ref={picker} type="file" multiple hidden aria-label={copy.mail.attach} onChange={(event) => { onAttach(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
      <PillButton type="button" tone="ghost" size="full" showArrow={false} disabled={!online || attaching} onClick={() => picker.current?.click()}>{attaching ? 'Uploading…' : copy.mail.attach}</PillButton>
      {!online && <p className="mail-hint">{copy.mail.attachOffline}</p>}
      <p className="mail-hint">{copy.mail.externalWarning}</p>
      {problem && <Banner id="mail-problem" tone="bad" role="alert" floating onDismiss={onDismissProblem ?? (() => undefined)}>{problem}</Banner>}
      {!online && <p role="status" className="mail-hint">{copy.mail.queued}</p>}
      <SheetActions>
        <PillButton type="submit" tone="forest" size="full" disabled={!canSend}>{copy.mail.send}</PillButton>
        <PillButton type="button" tone="ghost" size="full" showArrow={false} onClick={onSaveDraft}>{copy.mail.saveDraft}</PillButton>
        <PillButton type="button" tone="ghost" size="full" showArrow={false} onClick={requestClose}>{copy.generic.cancel}</PillButton>
      </SheetActions>
    </form>
    {closeConfirm ? <Sheet role="alertdialog" placement="center" labelledBy="mail-close-confirm-title" className="mr-send-confirm"><h3 id="mail-close-confirm-title">Save your changes?</h3><p>Your draft has changed since it was opened.</p><SheetActions><PillButton type="button" tone="forest" size="full" showArrow={false} onClick={onSaveDraft}>Save draft and close</PillButton><PillButton type="button" tone="ghost" size="full" showArrow={false} onClick={() => onDiscard(value)}>Discard changes</PillButton><PillButton type="button" tone="ghost" size="full" showArrow={false} onClick={() => setCloseConfirm(false)}>Keep editing</PillButton></SheetActions></Sheet> : null}
  </Sheet></NurseMailUiProvider>;
}
