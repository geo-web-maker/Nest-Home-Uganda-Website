import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ButtonGroup } from '../../../components/admin/ButtonGroup';
import { Modal } from '../../../components/admin/Modal';
import { Notice } from '../../../components/admin/Notice';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { apiClient } from '../../../lib/api/client';
import { formatBytes, invalidRecipients, parseRecipients } from './recipients';
import type { ComposeSeed } from './types';
import styles from './MailPage.module.css';

type Upload = { id: string; filename: string; size: number };

interface Props {
  mailboxId: string;
  seed: ComposeSeed;
  onClose: () => void;
  /** Called after Send succeeds or a draft is saved or deleted, so the list can refresh. */
  onDone: (outcome: 'sent' | 'saved' | 'deleted') => void;
}

/** Compose, reply and forward dialog. Saving, sending and attaching all go through one server draft. */
export function MailCompose({ mailboxId, seed, onClose, onDone }: Props) {
  const { t } = useTranslation('admin');
  const [to, setTo] = useState(seed.to.join(', '));
  const [cc, setCc] = useState(seed.cc.join(', '));
  const [bcc, setBcc] = useState(seed.bcc.join(', '));
  const [showCc, setShowCc] = useState(seed.cc.length > 0 || seed.bcc.length > 0);
  const [subject, setSubject] = useState(seed.subject);
  const [body, setBody] = useState(seed.body);
  const [draftId, setDraftId] = useState(seed.draftId ?? '');
  const [uploads, setUploads] = useState<Upload[]>(seed.attachments ?? []);
  const [busy, setBusy] = useState<'' | 'send' | 'save' | 'delete' | 'attach'>('');
  const [error, setError] = useState('');
  const picker = useRef<HTMLInputElement>(null);

  const toList = parseRecipients(to);
  const ccList = parseRecipients(cc);
  const bccList = parseRecipients(bcc);
  const bad = invalidRecipients([...toList, ...ccList, ...bccList]);
  const recipientError = bad.length ? t('mail.invalidRecipients', { list: bad.join(', ') }) : undefined;
  const canSend = toList.length > 0 && bad.length === 0 && subject.trim() !== '' && body.trim() !== '' && busy === '';

  const payload = () => ({
    mailbox_id: mailboxId,
    to: toList,
    cc: ccList,
    bcc: bccList,
    subject,
    body_text: body,
    in_reply_to: seed.inReplyTo ?? null,
  });

  /** Creates the draft the first time, updates it afterwards. */
  async function ensureDraft(): Promise<string> {
    if (draftId) {
      await apiClient.put(`/mail/drafts/${draftId}`, payload());
      return draftId;
    }
    const created = await apiClient.post<{ id: string }>('/mail/drafts', payload());
    setDraftId(created.id);
    return created.id;
  }

  async function run(kind: 'send' | 'save' | 'delete' | 'attach', work: () => Promise<void>) {
    setBusy(kind);
    setError('');
    try {
      await work();
    } catch {
      setError(kind === 'send' ? t('mail.sendError') : t('mail.actionError'));
    } finally {
      setBusy('');
    }
  }

  const send = () =>
    run('send', async () => {
      const id = await ensureDraft();
      await apiClient.post(`/mail/drafts/${id}/send`, { mailbox_id: mailboxId });
      onDone('sent');
    });

  const save = () =>
    run('save', async () => {
      await ensureDraft();
      onDone('saved');
    });

  const discard = () =>
    run('delete', async () => {
      if (draftId) await apiClient.delete(`/mail/drafts/${draftId}`);
      onDone('deleted');
    });

  async function attachOne(id: string, file: File) {
    const slot = await apiClient.post<{ attachment_id: string; upload_url: string }>('/mail/attachments/presign', {
      mailbox_id: mailboxId,
      filename: file.name,
      content_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
    });
    const put = await fetch(slot.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    if (!put.ok) throw new Error('upload failed');
    await apiClient.post(`/mail/attachments/${slot.attachment_id}/confirm`);
    await apiClient.post(`/mail/drafts/${id}/attachments/${slot.attachment_id}`);
    setUploads((current) => [...current, { id: slot.attachment_id, filename: file.name, size: file.size }]);
  }

  const removeUpload = (attachmentId: string) =>
    run('attach', async () => {
      await apiClient.delete(`/mail/drafts/${draftId}/attachments/${attachmentId}`);
      setUploads((current) => current.filter((upload) => upload.id !== attachmentId));
    });

  const attach = (files: FileList | null) => {
    const chosen = Array.from(files ?? []);
    if (picker.current) picker.current.value = '';
    if (chosen.length === 0) return;
    setBusy('attach');
    setError('');
    void (async () => {
      try {
        const id = await ensureDraft();
        for (const file of chosen) {
          try {
            await attachOne(id, file);
          } catch {
            setError(t('mail.attachFailed', { name: file.name }));
          }
        }
      } catch {
        setError(t('mail.actionError'));
      } finally {
        setBusy('');
      }
    })();
  };

  return (
    <Modal id="mail-compose-title" title={t('mail.compose')} onClose={onClose} closeLabel={t('mail.close')}>
      <div className={styles.composeForm}>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Field
          label={t('mail.to')}
          value={to}
          onChange={(event) => setTo(event.target.value)}
          placeholder={t('mail.toHint')}
          error={recipientError}
          autoComplete="off"
        />
        {showCc ? (
          <>
            <Field label={t('mail.cc')} value={cc} onChange={(event) => setCc(event.target.value)} autoComplete="off" />
            <Field label={t('mail.bcc')} value={bcc} onChange={(event) => setBcc(event.target.value)} autoComplete="off" />
          </>
        ) : (
          <div>
            <Button variant="outline" size="compact" onClick={() => setShowCc(true)}>
              {t('mail.showCcBcc')}
            </Button>
          </div>
        )}
        <Field label={t('mail.subject')} value={subject} onChange={(event) => setSubject(event.target.value)} />
        <Field kind="textarea" label={t('mail.message')} rows={10} value={body} onChange={(event) => setBody(event.target.value)} />
        {uploads.length > 0 ? (
          <ul className={styles.attachments} aria-label={t('mail.attachments')}>
            {uploads.map((upload) => (
              <li key={upload.id}>
                <span>
                  {upload.filename} · {formatBytes(upload.size)}
                </span>
                <Button variant="outline" size="compact" disabled={busy !== ''} aria-label={t('mail.removeAttachment', { name: upload.filename })} onClick={() => void removeUpload(upload.id)}>
                  {t('mail.remove')}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className={styles.hint}>{t('mail.externalWarning')}</p>
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          aria-label={t('mail.attach')}
          onChange={(event) => attach(event.target.files)}
        />
        <ButtonGroup spaced>
          <Button disabled={!canSend} onClick={() => void send()}>
            {busy === 'send' ? t('mail.sending') : t('mail.send')}
          </Button>
          <Button variant="outline" disabled={busy !== ''} onClick={() => picker.current?.click()}>
            {t('mail.attach')}
          </Button>
          <Button variant="outline" disabled={busy !== '' || bad.length > 0} onClick={() => void save()}>
            {t('mail.saveDraft')}
          </Button>
          <Button variant="outline" disabled={busy !== ''} onClick={() => void discard()}>
            {t('mail.deleteDraft')}
          </Button>
        </ButtonGroup>
      </div>
    </Modal>
  );
}
