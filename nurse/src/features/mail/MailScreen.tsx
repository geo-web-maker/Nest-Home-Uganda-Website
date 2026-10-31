import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, type ApiError } from '../../lib/api/client';
import { copy } from '../../copy';
import { Banner } from '../../ui/Banner';
import { Card } from '../../ui/Card';
import { Chip } from '../../ui/Chip';
import { PillButton } from '../../ui/PillButton';
import { Row } from '../../ui/Row';
import { MailRow } from './MailRow';
import { MailComposeSheet, type ComposeState } from './MailComposeSheet';
import { invalidAddresses, parseAddresses, quoteBody, replySubject } from './mailAddresses';
import { listDrafts, putDraft, readMailCache, recoverInterruptedDrafts, removeDraft, writeMailCache, type CachedBox, type CachedMessage, type MailDraft } from './mailStore';

type Folder = keyof typeof copy.mail.folders;
const FOLDERS = Object.keys(copy.mail.folders) as Folder[];
type Detail = { recipients: { kind: string; address: string }[]; attachments: { id: string; filename: string; size_bytes: number }[]; body_text: string };

const blank = (mailboxId: string): ComposeState => ({ id: globalThis.crypto?.randomUUID?.() ?? `draft-${Date.now()}`, mailboxId, to: '', subject: '', body: '', attachments: [] });
const isPermanent = (error: unknown) => {
  const status = (error as Partial<ApiError> | null)?.status ?? 0;
  return status >= 400 && status < 500 && ![401, 408, 429].includes(status);
};

export function MailScreen() {
  const ownerId = localStorage.getItem('nest.nurse.cache-user-id') ?? '';
  const [online, setOnline] = useState(navigator.onLine);
  const [boxes, setBoxes] = useState<CachedBox[]>([]);
  const [boxChoice, setBoxChoice] = useState('');
  const [folder, setFolder] = useState<Folder>('inbox');
  const [messages, setMessages] = useState<CachedMessage[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [drafts, setDrafts] = useState<MailDraft[]>([]);
  const [composer, setComposer] = useState<ComposeState | null>(null);
  const [problem, setProblem] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const flushing = useRef(false);
  const activeBoxId = boxChoice || boxes[0]?.id || '';
  const selected = messages.find((message) => message.mailbox_message_id === selectedId);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  const reloadDrafts = useCallback(async () => setDrafts(await listDrafts(ownerId)), [ownerId]);

  const refresh = useCallback(async () => {
    if (!navigator.onLine) return;
    setLoading(true);
    setError('');
    try {
      const list = await apiRequest<{ items: CachedBox[] }>('/mail/mailboxes');
      const id = list.items.some((box) => box.id === boxChoice) ? boxChoice : list.items[0]?.id ?? '';
      const page = id ? await apiRequest<{ items: CachedMessage[] }>(`/mail/mailboxes/${id}/messages?folder=${folder}`) : { items: [] };
      setBoxes(list.items);
      setMessages(page.items);
    } catch {
      setError(copy.mail.error);
    } finally {
      setLoading(false);
    }
  }, [boxChoice, folder]);

  // Show what was saved last time straight away, then replace it with fresh mail.
  useEffect(() => {
    void (async () => {
      const cached = await readMailCache();
      if (cached) { setBoxes(cached.boxes); setMessages(cached.messages); if (cached.folder === 'inbox') setFolder('inbox'); }
      await recoverInterruptedDrafts(ownerId);
      await reloadDrafts();
    })();
  }, [ownerId, reloadDrafts]);

  useEffect(() => { void refresh(); }, [refresh, online]);

  useEffect(() => {
    if (boxes.length > 0) void writeMailCache({ boxes, boxId: activeBoxId, folder, messages });
  }, [boxes, messages, activeBoxId, folder]);

  const flush = useCallback(async () => {
    if (!ownerId || flushing.current || !navigator.onLine) return;
    flushing.current = true;
    let sent = false;
    try {
      for (const draft of await listDrafts(ownerId)) {
        if (draft.state !== 'queued') continue;
        let serverId = draft.serverDraftId;
        await putDraft({ ...draft, state: 'sending' });
        try {
          const content = JSON.stringify({ mailbox_id: draft.mailboxId, to: draft.to, subject: draft.subject, body_text: draft.body, in_reply_to: draft.inReplyTo ?? null });
          if (!serverId) {
            const saved = await apiRequest<{ id: string }>('/mail/drafts', { method: 'POST', body: content });
            serverId = saved.id;
            await putDraft({ ...draft, state: 'sending', serverDraftId: serverId });
          } else {
            // The server copy may be older than what was typed since (for example after attaching a file).
            await apiRequest(`/mail/drafts/${serverId}`, { method: 'PUT', body: content });
          }
          await apiRequest(`/mail/drafts/${serverId}/send`, { method: 'POST', body: JSON.stringify({ mailbox_id: draft.mailboxId }) });
          await removeDraft(draft.id);
          sent = true;
          setNotice(copy.mail.sentOk);
        } catch (failure) {
          const permanent = isPermanent(failure);
          await putDraft({ ...draft, state: permanent ? 'failed' : 'queued', serverDraftId: serverId });
          if (permanent) { setError(copy.mail.sendError); continue; }
          break;
        }
      }
    } finally {
      flushing.current = false;
      await reloadDrafts();
      if (sent) void refresh();
    }
  }, [ownerId, reloadDrafts, refresh]);

  useEffect(() => { if (online) void flush(); }, [online, flush]);

  const open = async (message: CachedMessage) => {
    setSelectedId(message.mailbox_message_id);
    setDetail(null);
    setNotice('');
    if (!navigator.onLine) { setDetail({ recipients: [], attachments: [], body_text: message.body_text }); return; }
    try {
      const full = await apiRequest<Detail>(`/mail/messages/${message.mailbox_message_id}`);
      setDetail(full);
      if (!message.is_read) {
        setMessages((list) => list.map((item) => (item.mailbox_message_id === message.mailbox_message_id ? { ...item, is_read: true } : item)));
        setBoxes((list) => list.map((box) => (box.id === activeBoxId && folder === 'inbox' ? { ...box, unread_count: Math.max(0, box.unread_count - 1) } : box)));
      }
    } catch {
      setError(copy.mail.error);
    }
  };

  const change = async (message: CachedMessage, changes: Record<string, unknown>, leaves = false) => {
    if (!navigator.onLine) { setNotice(copy.mail.offlineAction); return; }
    setNotice('');
    try {
      await apiRequest(`/mail/messages/${message.mailbox_message_id}`, { method: 'PATCH', body: JSON.stringify(changes) });
      if (leaves) setSelectedId('');
      await refresh();
    } catch {
      setError(copy.mail.actionError);
    }
  };

  const download = async (attachmentId: string) => {
    try {
      const link = await apiRequest<{ download_url: string }>(`/mail/attachments/${attachmentId}/download`);
      window.open(link.download_url, '_blank', 'noopener,noreferrer');
    } catch {
      setError(copy.mail.downloadFailed);
    }
  };

  const startReply = () => {
    if (!selected) return;
    setProblem('');
    setComposer({ ...blank(activeBoxId), to: selected.from_address, subject: replySubject(selected.subject), body: `\n\n${quoteBody(detail?.body_text ?? selected.body_text)}`, inReplyTo: selected.message_id });
  };

  const save = async (state: 'draft' | 'queued') => {
    if (!composer) return;
    const addresses = parseAddresses(composer.to);
    const bad = invalidAddresses(addresses);
    if (bad.length) { setProblem(copy.mail.invalidRecipients.replace('{list}', bad.join(', '))); return; }
    if (state === 'queued' && addresses.length === 0) { setProblem(copy.mail.needRecipient); return; }
    try {
      await putDraft({ id: composer.id, ownerId, mailboxId: composer.mailboxId, to: addresses, subject: composer.subject, body: composer.body, inReplyTo: composer.inReplyTo, serverDraftId: composer.serverDraftId, attachments: composer.attachments, state, savedAt: new Date().toISOString() });
    } catch {
      setProblem(copy.mail.draftStoreError);
      return;
    }
    setComposer(null);
    setProblem('');
    await reloadDrafts();
    if (state === 'draft') setNotice(copy.mail.draftSaved);
    else if (navigator.onLine) void flush();
    else setNotice(copy.mail.queued);
  };

  const editDraft = (draft: MailDraft) => {
    setProblem('');
    setComposer({ id: draft.id, mailboxId: draft.mailboxId, to: draft.to.join(', '), subject: draft.subject, body: draft.body, inReplyTo: draft.inReplyTo, serverDraftId: draft.serverDraftId, attachments: draft.attachments ?? [] });
  };
  const discardDraft = async (draft: MailDraft) => {
    await removeDraft(draft.id);
    if (draft.serverDraftId && navigator.onLine) { try { await apiRequest(`/mail/drafts/${draft.serverDraftId}`, { method: 'DELETE' }); } catch { /* The server copy is only a draft; it expires with the mailbox. */ } }
    await reloadDrafts();
  };
  const sendNow = async (draft: MailDraft) => { await putDraft({ ...draft, state: 'queued' }); await reloadDrafts(); void flush(); };

  const [attaching, setAttaching] = useState(false);
  const attach = async (files: File[]) => {
    if (!composer || files.length === 0) return;
    if (!navigator.onLine) { setProblem(copy.mail.attachOffline); return; }
    const addresses = parseAddresses(composer.to);
    if (invalidAddresses(addresses).length) { setProblem(copy.mail.invalidRecipients.replace('{list}', invalidAddresses(addresses).join(', '))); return; }
    setAttaching(true);
    setProblem('');
    let current = composer;
    try {
      const content = JSON.stringify({ mailbox_id: current.mailboxId, to: addresses, subject: current.subject, body_text: current.body, in_reply_to: current.inReplyTo ?? null });
      let serverId = current.serverDraftId;
      if (serverId) await apiRequest(`/mail/drafts/${serverId}`, { method: 'PUT', body: content });
      else serverId = (await apiRequest<{ id: string }>('/mail/drafts', { method: 'POST', body: content })).id;
      current = { ...current, serverDraftId: serverId };
      for (const file of files) {
        try {
          const type = file.type || 'application/octet-stream';
          const slot = await apiRequest<{ attachment_id: string; upload_url: string }>('/mail/attachments/presign', { method: 'POST', body: JSON.stringify({ mailbox_id: current.mailboxId, filename: file.name, content_type: type, size_bytes: file.size }) });
          const put = await fetch(slot.upload_url, { method: 'PUT', headers: { 'Content-Type': type }, body: file });
          if (!put.ok) throw new Error('upload failed');
          await apiRequest(`/mail/attachments/${slot.attachment_id}/confirm`, { method: 'POST' });
          await apiRequest(`/mail/drafts/${serverId}/attachments/${slot.attachment_id}`, { method: 'POST' });
          current = { ...current, attachments: [...current.attachments, { id: slot.attachment_id, filename: file.name, size: file.size }] };
        } catch {
          setProblem(copy.mail.attachFailed.replace('{name}', file.name));
        }
      }
    } catch {
      setProblem(copy.mail.actionError);
    } finally {
      setComposer((now) => (now && now.id === current.id ? { ...now, serverDraftId: current.serverDraftId, attachments: current.attachments } : now));
      setAttaching(false);
    }
  };

  const removeAttachment = async (attachmentId: string) => {
    if (!composer?.serverDraftId) return;
    if (!navigator.onLine) { setProblem(copy.mail.offlineAction); return; }
    setAttaching(true);
    try {
      await apiRequest(`/mail/drafts/${composer.serverDraftId}/attachments/${attachmentId}`, { method: 'DELETE' });
      setComposer((now) => (now ? { ...now, attachments: now.attachments.filter((file) => file.id !== attachmentId) } : now));
      setProblem('');
    } catch {
      setProblem(copy.mail.actionError);
    } finally {
      setAttaching(false);
    }
  };

  const swipeMessage = (message: CachedMessage, direction: 'left' | 'right') => {
    if (direction === 'left') void change(message, { folder: folder === 'trash' || folder === 'spam' ? 'inbox' : 'trash' });
    else void change(message, { is_starred: !message.is_starred });
  };

  const mailboxPicker = boxes.length > 1 && <div className="stack-form">
    <label htmlFor="mail-mailbox">{copy.mail.mailbox}</label>
    <select id="mail-mailbox" value={activeBoxId} onChange={(event) => { setBoxChoice(event.target.value); setSelectedId(''); }}>
      {boxes.map((box) => <option key={box.id} value={box.id}>{box.display_name} ({box.unread_count})</option>)}
    </select>
  </div>;

  return <section className="screen mail-screen" aria-labelledby="mail-heading">
    <header className="screen-heading">
      <div><p className="eyebrow">{copy.mail.eyebrow}</p><h2 id="mail-heading">{copy.mail.title}</h2></div>
      <PillButton type="button" tone="gold" size="sm" showArrow={false} onClick={() => { setProblem(''); setComposer(blank(activeBoxId)); }} disabled={!activeBoxId || !ownerId}>{copy.mail.compose}</PillButton>
    </header>
    {!online && <Banner tone="warn">{copy.mail.offline}</Banner>}
    {error && <Banner tone="bad" role="alert">{error}</Banner>}
    {notice && <Banner tone="ok">{notice}</Banner>}
    {boxes.length === 0 && !loading && online && !error && <Banner tone="info">{copy.mail.noMailbox}</Banner>}
    {mailboxPicker}

    {drafts.length > 0 && <Card>
      <h3>{copy.mail.draftsHeading}</h3>
      <ul className="mail-drafts">
        {drafts.map((draft) => <li key={draft.id}>
          <Row label={draft.subject || copy.mail.noSubject} value={`${copy.mail.sentBy} ${draft.to.join(', ') || '—'}`} />
          <Chip kind={draft.state === 'failed' ? 'bad' : draft.state === 'draft' ? 'pd' : 'pg'}>{copy.mail.draftStates[draft.state]}</Chip>
          <div className="mail-actions">
            <PillButton type="button" tone="ghost" size="sm" showArrow={false} onClick={() => editDraft(draft)}>{copy.mail.editDraft}</PillButton>
            {(draft.state === 'draft' || draft.state === 'failed') && <PillButton type="button" tone="forest" size="sm" showArrow={false} onClick={() => void sendNow(draft)}>{copy.mail.sendNow}</PillButton>}
            <PillButton type="button" tone="danger" size="sm" showArrow={false} onClick={() => void discardDraft(draft)}>{copy.mail.discardDraft}</PillButton>
          </div>
        </li>)}
      </ul>
    </Card>}

    {selected ? <Card>
      <div className="mail-actions">
        <PillButton type="button" tone="ghost" size="sm" showArrow={false} onClick={() => setSelectedId('')}>{copy.mail.backToList}</PillButton>
        <PillButton type="button" tone="forest" size="sm" showArrow={false} onClick={startReply} disabled={!online}>{copy.mail.reply}</PillButton>
        <PillButton type="button" tone="ghost" size="sm" showArrow={false} disabled={!online} onClick={() => void change(selected, { is_starred: !selected.is_starred })}>{selected.is_starred ? copy.mail.unstar : copy.mail.star}</PillButton>
        <PillButton type="button" tone="ghost" size="sm" showArrow={false} disabled={!online} onClick={() => void change(selected, { is_read: false }, true)}>{copy.mail.markUnread}</PillButton>
        <PillButton type="button" tone="ghost" size="sm" showArrow={false} disabled={!online} onClick={() => void change(selected, { folder: folder === 'trash' || folder === 'spam' ? 'inbox' : 'trash' }, true)}>{folder === 'trash' || folder === 'spam' ? copy.mail.restore : copy.mail.trash}</PillButton>
      </div>
      <h3>{selected.subject || copy.mail.noSubject}</h3>
      {selected.origin === 'inbound' && <Banner tone="warn">{copy.mail.externalBanner}</Banner>}
      <p className="mail-meta">{copy.mail.from}: {selected.from_name ? `${selected.from_name} <${selected.from_address}>` : selected.from_address}</p>
      <p className="mail-meta">{new Date(selected.received_at).toLocaleString()}</p>
      {!detail ? <p role="status">{copy.mail.loading}</p> : <p className="mail-body">{detail.body_text}</p>}
      {detail && detail.attachments.length > 0 && <div>
        <h4>{copy.mail.attachments}</h4>
        <ul className="mail-drafts">{detail.attachments.map((file) => <li key={file.id}><Row label={file.filename} value={`${Math.max(1, Math.round(file.size_bytes / 1024))} KB`} /><PillButton type="button" tone="ghost" size="sm" showArrow={false} disabled={!online} onClick={() => void download(file.id)}>{copy.mail.download}</PillButton></li>)}</ul>
      </div>}
    </Card> : <>
      <div className="mail-folders" role="group" aria-label={copy.mail.folder}>
        {FOLDERS.map((name) => <PillButton key={name} type="button" tone={folder === name ? 'forest' : 'ghost'} size="sm" showArrow={false} aria-pressed={folder === name} onClick={() => { setFolder(name); setSelectedId(''); }}>{copy.mail.folders[name]}</PillButton>)}
        <PillButton type="button" tone="ghost" size="sm" showArrow={false} disabled={!online} onClick={() => void refresh()}>{copy.mail.refresh}</PillButton>
      </div>
      <Card>
        {loading && messages.length === 0 && <p role="status">{copy.mail.loading}</p>}
        {!loading && messages.length === 0 && <p>{copy.mail.empty}</p>}
        <ul className="mail-list">
          {messages.map((message) => <MailRow key={message.mailbox_message_id} message={message} onOpen={() => void open(message)} onSwipe={(direction) => swipeMessage(message, direction)} />)}
        </ul>
      </Card>
    </>}

    {composer && <MailComposeSheet value={composer} problem={problem} online={online} attaching={attaching} onAttach={(files) => void attach(files)} onRemoveAttachment={(id) => void removeAttachment(id)} onChange={(next) => { setComposer(next); setProblem(''); }} onSend={() => void save('queued')} onSaveDraft={() => void save('draft')} onCancel={() => setComposer(null)} />}
  </section>;
}
