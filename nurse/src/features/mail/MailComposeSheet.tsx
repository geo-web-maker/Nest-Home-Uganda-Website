import { useEffect, useRef, type FormEvent } from 'react';
import { copy } from '../../copy';
import { PillButton } from '../../ui/PillButton';
import { Row } from '../../ui/Row';
import { Sheet, SheetActions } from '../../ui/Sheet';

export type ComposeState = {
  /** Local draft id; stays the same while the draft is edited, saved or retried. */
  id: string;
  mailboxId: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  serverDraftId?: string;
  attachments: { id: string; filename: string; size: number }[];
};

type Props = {
  value: ComposeState;
  problem: string;
  online: boolean;
  attaching: boolean;
  onAttach: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onChange: (next: ComposeState) => void;
  onSend: () => void;
  onSaveDraft: () => void;
  onCancel: () => void;
};

/** Compose sheet. Closes on Escape and puts the cursor in the first empty field. */
export function MailComposeSheet({ value, problem, online, attaching, onAttach, onRemoveAttachment, onChange, onSend, onSaveDraft, onCancel }: Props) {
  const first = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    first.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSend();
  };
  const canSend = value.to.trim() !== '' && value.subject.trim() !== '' && value.body.trim() !== '';

  return <Sheet labelledBy="mail-compose-title" className="mail-compose-sheet">
    <h2 id="mail-compose-title">{copy.mail.compose}</h2>
    <form onSubmit={submit} className="stack-form">
      <label htmlFor="mail-to">{copy.mail.to}</label>
      <input ref={first} id="mail-to" value={value.to} onChange={(event) => onChange({ ...value, to: event.target.value })} placeholder={copy.mail.toHint} autoComplete="off" aria-describedby={problem ? 'mail-problem' : undefined} aria-invalid={problem ? true : undefined} />
      <label htmlFor="mail-subject">{copy.mail.subject}</label>
      <input id="mail-subject" value={value.subject} onChange={(event) => onChange({ ...value, subject: event.target.value })} />
      <label htmlFor="mail-body">{copy.mail.message}</label>
      <textarea id="mail-body" rows={8} value={value.body} onChange={(event) => onChange({ ...value, body: event.target.value })} />
      {value.attachments.length > 0 && <ul className="mail-drafts" aria-label={copy.mail.attachedHeading}>
        {value.attachments.map((file) => <li key={file.id}><Row label={file.filename} value={`${Math.max(1, Math.round(file.size / 1024))} KB`} /><PillButton type="button" tone="ghost" size="sm" showArrow={false} disabled={!online || attaching} aria-label={copy.mail.removeAttachment.replace('{name}', file.filename)} onClick={() => onRemoveAttachment(file.id)}>{copy.mail.remove}</PillButton></li>)}
      </ul>}
      <input ref={picker} type="file" multiple hidden aria-label={copy.mail.attach} onChange={(event) => { onAttach(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
      <PillButton type="button" tone="ghost" size="full" showArrow={false} disabled={!online || attaching} onClick={() => picker.current?.click()}>{copy.mail.attach}</PillButton>
      {!online && <p className="mail-hint">{copy.mail.attachOffline}</p>}
      <p className="mail-hint">{copy.mail.externalWarning}</p>
      {problem && <p id="mail-problem" role="alert" className="mail-problem">{problem}</p>}
      {!online && <p role="status" className="mail-hint">{copy.mail.queued}</p>}
      <SheetActions>
        <PillButton type="submit" tone="forest" size="full" disabled={!canSend}>{copy.mail.send}</PillButton>
        <PillButton type="button" tone="ghost" size="full" showArrow={false} onClick={onSaveDraft}>{copy.mail.saveDraft}</PillButton>
        <PillButton type="button" tone="ghost" size="full" showArrow={false} onClick={onCancel}>{copy.generic.cancel}</PillButton>
      </SheetActions>
    </form>
  </Sheet>;
}
