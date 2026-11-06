import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ButtonGroup } from '../../../components/admin/ButtonGroup';
import { Modal } from '../../../components/admin/Modal';
import { Notice } from '../../../components/admin/Notice';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { ConfirmPopup } from './ConfirmPopup';
import { RecipientInput } from './RecipientInput';
import { apiClient } from '../../../lib/api/client';
import { AttachmentList } from '../../../shared/mail-rich/react/AttachmentList';
import { useAttachmentUploader } from '../../../shared/mail-rich/react/useAttachmentUploader';
import { useDraftAutosave } from '../../../shared/mail-rich/react/useDraftAutosave';
import type { DraftResponse, MailAttachment, MailFormat } from '../../../shared/mail-rich/core/types';
import { htmlToText } from '../../../shared/mail-rich/core/htmlToText';
import { AdminMailUiProvider } from './mailUiKit';
import { invalidRecipients, parseRecipients } from './recipients';
import type { ComposeSeed } from './types';
import styles from './MailPage.module.css';

const LazyMailRichEditor = lazy(() => import('../../../shared/mail-rich/react/MailRichEditor').then((module) => ({ default: module.MailRichEditor })));

type Upload = MailAttachment & { filename: string; size_bytes: number };
interface Props {
  mailboxId: string;
  seed: ComposeSeed;
  onClose: () => void;
  onDone: (outcome: 'sent' | 'saved' | 'deleted') => void;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function plainToHtml(value: string): string {
  return value.split(/\r?\n/).map((line) => `<p>${line ? escapeHtml(line) : '<br>'}</p>`).join('');
}
function asMailAttachment(upload: NonNullable<ComposeSeed['attachments']>[number]): MailAttachment {
  return {
    id: upload.id,
    filename: upload.filename,
    size_bytes: upload.size,
    content_type: upload.content_type ?? 'application/octet-stream',
    scan_state: upload.scan_state ?? 'unscanned',
    disposition: upload.disposition ?? 'attachment',
    content_id: upload.content_id ?? null,
    blocked_reason: upload.blocked_reason ?? null,
  };
}

/** Shared rich composer. Drafts are autosaved server-side; uploads, quote data and send guards share one draft id. */
export function MailCompose({ mailboxId, seed, onClose, onDone }: Props) {
  const { t } = useTranslation('admin');
  const uploadClient = useMemo(() => ({ post: <T,>(path: string, body: unknown) => apiClient.post<T>(path, body) }), []);
  const uploader = useAttachmentUploader(uploadClient);
  const [to, setTo] = useState(seed.to.join(', '));
  const [cc, setCc] = useState(seed.cc.join(', '));
  const [bcc, setBcc] = useState(seed.bcc.join(', '));
  const [showCc, setShowCc] = useState(seed.cc.length > 0 || seed.bcc.length > 0);
  const [subject, setSubject] = useState(seed.subject);
  const initialFormat: MailFormat = seed.bodyFormat ?? (seed.bodyHtml ? 'html' : seed.draftId ? 'plain' : 'html');
  const [body, setBody] = useState(seed.body);
  const [bodyHtml, setBodyHtml] = useState(seed.bodyHtml || (initialFormat === 'html' ? plainToHtml(seed.body) : ''));
  const [format, setFormat] = useState<MailFormat>(initialFormat);
  const [quoteHtml, setQuoteHtml] = useState<string | null>(seed.quotedHtml ?? null);
  const [removeQuote, setRemoveQuote] = useState(false);
  const [draftId, setDraftId] = useState(seed.draftId ?? '');
  const draftIdRef = useRef(seed.draftId ?? '');
  const [uploads, setUploads] = useState<Upload[]>((seed.attachments ?? []).map((file) => asMailAttachment(file)));
  const [busy, setBusy] = useState<'' | 'send' | 'save' | 'delete' | 'attach'>('');
  const [error, setError] = useState('');
  const [sendConfirm, setSendConfirm] = useState(false);
  const [plainConfirm, setPlainConfirm] = useState(false);
  const [editorNotice, setEditorNotice] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  const initialSnapshot = useRef(JSON.stringify({ to: seed.to.join(', '), cc: seed.cc.join(', '), bcc: seed.bcc.join(', '), subject: seed.subject, body: initialFormat === 'plain' ? seed.body : '', bodyHtml: initialFormat === 'html' ? (seed.bodyHtml || plainToHtml(seed.body)) : '', bodyFormat: initialFormat, quotedHtml: seed.quotedHtml ?? null, removeQuote: false, attachments: (seed.attachments ?? []).map(asMailAttachment) }));
  const [closeConfirm, setCloseConfirm] = useState(false);

  const toList = useMemo(() => parseRecipients(to), [to]);
  const ccList = useMemo(() => parseRecipients(cc), [cc]);
  const bccList = useMemo(() => parseRecipients(bcc), [bcc]);
  const bad = invalidRecipients([...toList, ...ccList, ...bccList]);
  const recipientError = bad.length ? t('mail.invalidRecipients', { list: bad.join(', ') }) : undefined;
  const hasBody = format === 'html' ? htmlToText(bodyHtml).trim() !== '' : body.trim() !== '';
  const canSend = toList.length > 0 && bad.length === 0 && subject.trim() !== '' && (hasBody || Boolean(seed.quote || quoteHtml)) && busy === '' && !uploader.busy;

  const dirty = JSON.stringify({ to, cc, bcc, subject, body: format === 'plain' ? body : '', bodyHtml: format === 'html' ? bodyHtml : '', bodyFormat: format, quotedHtml: quoteHtml, removeQuote, attachments: uploads }) !== initialSnapshot.current;
  const requestClose = () => { if (dirty) setCloseConfirm(true); else onClose(); };

  useEffect(() => {
    if (!dirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty]);

  const payload = useMemo(() => ({
    mailbox_id: mailboxId,
    to: toList,
    cc: ccList,
    bcc: bccList,
    subject,
    format,
    body_text: format === 'html' ? htmlToText(bodyHtml) : body,
    body_html: format === 'html' ? bodyHtml : null,
    in_reply_to: seed.inReplyTo ?? null,
    ...(removeQuote ? { remove_quote: true } : draftId || !seed.quote ? {} : { quote: seed.quote }),
  }), [mailboxId, toList, ccList, bccList, subject, format, body, bodyHtml, seed.inReplyTo, removeQuote, draftId, seed.quote]);

  /** A forward is meant to be edited, so the server-built quote moves into the editor and the saved copy is dropped. */
  const foldQuoteIntoBody = useCallback((quoted: string) => {
    setBodyHtml((current) => `${current && current !== '<p></p>' ? current : '<p></p>'}${quoted}`);
    setQuoteHtml(null);
    setRemoveQuote(true);
  }, []);
  const adoptCreated = useCallback((created: DraftResponse) => {
    if (created.quoted_html) {
      if (seed.quote?.kind === 'forward') foldQuoteIntoBody(created.quoted_html);
      else setQuoteHtml(created.quoted_html);
    }
    if (created.attachments?.length) setUploads(created.attachments as Upload[]);
  }, [seed.quote?.kind, foldQuoteIntoBody]);

  const ensureDraft = useCallback(async (): Promise<string> => {
    const activeDraftId = draftIdRef.current;
    if (activeDraftId) {
      await apiClient.put(`/mail/drafts/${activeDraftId}`, { ...payload, quote: undefined });
      return activeDraftId;
    }
    const created = await apiClient.post<DraftResponse>('/mail/drafts', payload);
    draftIdRef.current = created.id;
    setDraftId(created.id);
    adoptCreated(created);
    return created.id;
  }, [payload, adoptCreated]);

  const autosave = useCallback(async (value: typeof payload) => {
    if (busy === 'send' || busy === 'delete') return;
    if (!value.subject.trim() && !value.body_text.trim() && !value.to.length && !value.cc.length && !value.bcc.length && !seed.quote) return;
    const activeDraftId = draftIdRef.current;
    if (activeDraftId) await apiClient.put(`/mail/drafts/${activeDraftId}`, { ...value, quote: undefined });
    else {
      const created = await apiClient.post<DraftResponse>('/mail/drafts', value);
      draftIdRef.current = created.id;
      setDraftId(created.id);
      adoptCreated(created);
    }
  }, [busy, seed.quote, adoptCreated]);
  const autosaveStatus = useDraftAutosave(payload, autosave, 1000);

  async function run(kind: 'send' | 'save' | 'delete' | 'attach', work: () => Promise<void>) {
    setBusy(kind);
    setError('');
    try { await work(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : kind === 'send' ? t('mail.sendError') : t('mail.actionError')); }
    finally { setBusy(''); }
  }

  const send = () => run('send', async () => {
    const id = await ensureDraft();
    await apiClient.post(`/mail/drafts/${id}/send`, { mailbox_id: mailboxId });
    setSendConfirm(false);
    onDone('sent');
  });
  const save = () => run('save', async () => { await ensureDraft(); onDone('saved'); });
  const discard = () => run('delete', async () => {
    if (draftIdRef.current) await apiClient.delete(`/mail/drafts/${draftIdRef.current}`);
    onDone('deleted');
  });

  const attachOne = async (file: File, disposition: 'attachment' | 'inline' = 'attachment'): Promise<string | null> => {
    const id = await ensureDraft();
    const result = await uploader.upload(mailboxId, file, id, { disposition });
    const next: Upload = {
      id: result.id, filename: result.filename, size_bytes: result.size_bytes, content_type: result.content_type,
      sha256: result.sha256, scan_state: result.scan_state, disposition: result.disposition,
      content_id: result.content_id, blocked_reason: null,
    };
    setUploads((current) => [...current.filter((item) => item.id !== result.id), next]);
    return result.content_id ? `cid:${result.content_id}` : null;
  };

  const pasteImage = async (file: File) => attachOne(file, 'inline');
  const attach = (files: FileList | File[] | null) => {
    const chosen = Array.from(files ?? []);
    if (picker.current) picker.current.value = '';
    if (!chosen.length) return;
    void run('attach', async () => {
      for (const file of chosen) await attachOne(file);
    });
  };
  const removeUpload = (attachment: MailAttachment) => run('attach', async () => {
    if (!draftIdRef.current) return;
    await apiClient.delete(`/mail/drafts/${draftIdRef.current}/attachments/${attachment.id}`);
    setUploads((current) => current.filter((upload) => upload.id !== attachment.id));
  });

  const showPlainModeConfirmation = () => setPlainConfirm(true);
  const confirmPlainMode = () => {
    setBody(htmlToText(bodyHtml));
    setFormat('plain');
    setPlainConfirm(false);
  };
  const switchToRich = () => {
    setBodyHtml(plainToHtml(body));
    setFormat('html');
  };

  return <AdminMailUiProvider><Modal id="mail-compose-title" title={t('mail.compose')} onClose={requestClose} closeLabel={t('mail.close')}>
    <div className={styles.composeForm}>
      {error ? <Notice tone="error" role="alert">{error}</Notice> : null}
      {editorNotice ? <Notice tone="info">{editorNotice}</Notice> : null}
      <RecipientInput label={t('mail.to')} value={to} onChange={setTo} placeholder={t('mail.toHint')} error={recipientError} exclude={[...ccList, ...bccList]} />
      {showCc ? <>
        <RecipientInput label={t('mail.cc')} value={cc} onChange={setCc} exclude={[...toList, ...bccList]} />
        <RecipientInput label={t('mail.bcc')} value={bcc} onChange={setBcc} exclude={[...toList, ...ccList]} />
      </> : <div><Button variant="outline" size="compact" onClick={() => setShowCc(true)}>{t('mail.showCcBcc')}</Button></div>}
      <Field label={t('mail.subject')} value={subject} onChange={(event) => setSubject(event.target.value)} />
      <div className="mr-composer-mode" role="group" aria-label="Message format">
        <Button size="compact" variant={format === 'html' ? 'primary' : 'outline'} aria-pressed={format === 'html'} onClick={switchToRich}>Rich text</Button>
        <Button size="compact" variant={format === 'plain' ? 'primary' : 'outline'} aria-pressed={format === 'plain'} onClick={showPlainModeConfirmation}>Plain text</Button>
      </div>
      {format === 'html' ? <Suspense fallback={<p role="status">Loading editor…</p>}>
        <LazyMailRichEditor value={bodyHtml || '<p></p>'} onChange={(html, text) => { setBodyHtml(html); setBody(text); }} label={t('mail.message')} quotedHtml={quoteHtml && !removeQuote ? quoteHtml : null} quoteInitiallyExpanded={seed.quote?.kind === 'forward' || seed.quote?.kind === 'forward_attachment'} quoteLabel="Original message" removeQuoteLabel="Remove original message" onRemoveQuote={() => { setRemoveQuote(true); setQuoteHtml(null); }} onPasteImageBlocked={() => setEditorNotice('This image could not be added inline; it will be offered as a normal attachment.')} onPasteFiles={attach} onPasteImage={pasteImage} />
      </Suspense> : <Field kind="textarea" label={t('mail.message')} rows={10} value={body} onChange={(event) => setBody(event.target.value)} />}
      <div className="mr-upload-actions">
        <input ref={picker} type="file" multiple hidden aria-label={t('mail.attach')} onChange={(event) => attach(event.target.files)} />
        <Button variant="outline" size="compact" disabled={busy !== '' || uploader.busy} onClick={() => picker.current?.click()}>{busy === 'attach' ? t('mail.attaching') : t('mail.attach')}</Button>
      </div>
      {uploads.length ? <AttachmentList attachments={uploads} onRemove={(attachment) => void removeUpload(attachment)} actionLabel={t('mail.remove')} /> : null}
      <p className={styles.hint}>{t('mail.externalWarning')}</p>
      <p className="mr-autosave-status" role="status">{autosaveStatus === 'saving' ? 'Saving draft…' : autosaveStatus === 'error' ? 'Draft autosave failed; save manually.' : draftId ? 'Draft saved' : 'Draft changes will be saved automatically'}</p>
      <ButtonGroup spaced>
        <Button disabled={!canSend} onClick={() => setSendConfirm(true)}>{t('mail.send')}</Button>
        <Button variant="outline" disabled={busy !== '' || bad.length > 0} onClick={() => void save()}>{t('mail.saveDraft')}</Button>
        <Button variant="outline" disabled={busy !== ''} onClick={() => void discard()}>{t('mail.deleteDraft')}</Button>
      </ButtonGroup>
      {closeConfirm ? <ConfirmPopup labelledBy="mail-close-confirm-title" onDismiss={() => setCloseConfirm(false)}><h3 id="mail-close-confirm-title">Save your changes?</h3><p>Your draft has changed since it was opened.</p><ButtonGroup spaced><Button disabled={busy !== ''} onClick={() => void save()}>Save draft and close</Button><Button variant="outline" disabled={busy !== ''} onClick={() => void discard()}>Discard changes</Button><Button variant="outline" onClick={() => setCloseConfirm(false)}>Keep editing</Button></ButtonGroup></ConfirmPopup> : null}
      {sendConfirm ? <ConfirmPopup labelledBy="mail-send-confirm-title" onDismiss={() => { if (busy === '') setSendConfirm(false); }}>
        <h3 id="mail-send-confirm-title">Review before sending</h3>
        <dl><dt>To</dt><dd>{toList.join(', ') || '—'}</dd><dt>Cc</dt><dd>{ccList.join(', ') || '—'}</dd><dt>Bcc</dt><dd>{bccList.length ? `${bccList.join(', ')} (hidden from other recipients)` : '—'}</dd><dt>Subject</dt><dd>{subject || '—'}</dd><dt>Attachments</dt><dd>{uploads.length ? uploads.map((file) => file.filename).join(', ') : 'None'}</dd></dl>
        <p>Check the recipients and attachments. Sending cannot be undone.</p>
        <ButtonGroup spaced><Button disabled={!canSend} onClick={() => void send()}>{busy === 'send' ? t('mail.sending') : 'Confirm send'}</Button><Button variant="outline" disabled={busy !== ''} onClick={() => setSendConfirm(false)}>Go back</Button></ButtonGroup>
      </ConfirmPopup> : null}
      {plainConfirm ? <ConfirmPopup labelledBy="mail-plain-confirm-title" onDismiss={() => setPlainConfirm(false)}>
        <h3 id="mail-plain-confirm-title">Switch to plain text?</h3><p>Formatting, tables and links will be converted to plain text. This cannot be undone in the current editor session.</p>
        <ButtonGroup spaced><Button onClick={confirmPlainMode}>Switch to plain text</Button><Button variant="outline" onClick={() => setPlainConfirm(false)}>Keep rich text</Button></ButtonGroup>
      </ConfirmPopup> : null}
    </div>
  </Modal></AdminMailUiProvider>;
}
