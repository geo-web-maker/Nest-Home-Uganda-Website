import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, type ApiError } from '../../lib/api/client';
import { copy } from '../../copy';
import { Banner } from '../../ui/Banner';
import { Card } from '../../ui/Card';
import { Chip } from '../../ui/Chip';
import { PillButton } from '../../ui/PillButton';
import { Row } from '../../ui/Row';
import { MailRow } from './MailRow';
import { MailComposeSheet, type ComposeState } from './MailComposeSheet';
import { invalidAddresses, parseAddresses, replySubject } from './mailAddresses';
import { MailMessageView } from '../../shared/mail-rich/react/MailMessageView';
import type { MailMessageView as SharedMailMessage } from '../../shared/mail-rich/core/types';
import { useAttachmentUploader } from '../../shared/mail-rich/react/useAttachmentUploader';
import { NurseMailUiProvider } from './mailUiKit';
import '../../shared/mail-rich/react/mail-rich.css';
import { Sheet, SheetActions } from '../../ui/Sheet';
import { listDrafts, putDraft, readMailCache, recoverInterruptedDrafts, removeDraft, writeMailCache, type CachedBox, type CachedMessage, type MailDraft } from './mailStore';

type Folder = keyof typeof copy.mail.folders;
const FOLDERS = Object.keys(copy.mail.folders) as Folder[];
type Detail = { message_id_header?: string | null; recipients: { kind: 'to' | 'cc' | 'bcc' | string; address: string; name?: string | null }[]; attachments: { id: string; filename: string; size_bytes: number; content_type?: string; scan_state?: string; sha256?: string | null; disposition?: 'attachment' | 'inline'; content_id?: string | null; blocked_reason?: string | null; scan_detail?: string | null; scanned_at?: string | null }[]; body_text: string; body_html?: string | null; quoted_html?: string | null; has_remote_images?: boolean; can_download_original?: boolean; render_notes?: Record<string, unknown>; delivery?: { state: string; reason?: string | null; provider?: string; recipients: { address: string; event: string; at?: string | null }[] } | null };

function escapeMailHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
}
function quotePreview(detail: Detail | null, from: string): string | null {
  if (!detail) return null;
  const body = detail.body_html || (detail.body_text ? `<p>${escapeMailHtml(detail.body_text).replace(/\r?\n/g, '<br>')}</p>` : '');
  return `<div><p>On the original message from ${escapeMailHtml(from)}:</p><blockquote>${body}</blockquote></div>`;
}

const blank = (mailboxId: string): ComposeState => ({ id: globalThis.crypto?.randomUUID?.() ?? `draft-${Date.now()}`, mailboxId, to: '', cc: '', bcc: '', subject: '', body: '', bodyHtml: '<p></p>', bodyFormat: 'html', attachments: [] });
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
  const [externalLink, setExternalLink] = useState<string | null>(null);
  const flushing = useRef(false);
  const uploadClient = useMemo(() => ({
    post: <T,>(path: string, body: unknown) => apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  }), []);
  const uploader = useAttachmentUploader(uploadClient);
  const activeBoxId = boxChoice || boxes[0]?.id || '';
  const selected = messages.find((message) => message.mailbox_message_id === selectedId);

  const flushRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    // A queued message can fail while the browser still reports online, so the event retries it directly.
    const up = () => { setOnline(true); void flushRef.current(); };
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

  useEffect(() => {
    if (!composer || !ownerId) return;
    const handle = window.setTimeout(() => {
      void putDraft({
        id: composer.id, ownerId, mailboxId: composer.mailboxId,
        to: parseAddresses(composer.to), cc: parseAddresses(composer.cc), bcc: parseAddresses(composer.bcc),
        subject: composer.subject, body: composer.body, bodyHtml: composer.bodyHtml,
        bodyFormat: composer.bodyFormat ?? 'plain', quotedHtml: composer.quotedHtml,
        removeQuote: composer.removeQuote, inReplyTo: composer.inReplyTo, quote: composer.quote,
        serverDraftId: composer.serverDraftId, attachments: composer.attachments,
        state: 'draft', savedAt: new Date().toISOString(),
      }).then(() => reloadDrafts()).catch(() => setProblem(copy.mail.draftStoreError));
    }, 750);
    return () => window.clearTimeout(handle);
  }, [composer, ownerId, reloadDrafts]);


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
          const content = JSON.stringify({ mailbox_id: draft.mailboxId, to: draft.to, cc: draft.cc ?? [], bcc: draft.bcc ?? [], subject: draft.subject, format: draft.bodyFormat ?? (draft.bodyHtml ? 'html' : 'plain'), body_text: draft.body, body_html: draft.bodyHtml ?? null, in_reply_to: draft.inReplyTo ?? null, ...(draft.removeQuote ? { remove_quote: true } : serverId || !draft.quote ? {} : { quote: draft.quote }) });
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

  flushRef.current = flush;
  useEffect(() => { if (online) void flush(); }, [online, flush]);

  const open = async (message: CachedMessage) => {
    setSelectedId(message.mailbox_message_id);
    setDetail(null);
    setNotice('');
    if (!navigator.onLine) { setDetail({ recipients: [], attachments: [], body_text: message.body_text ?? message.snippet ?? '' }); return; }
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

  const downloadOriginal = async () => {
    if (!selected) return;
    try {
      const link = await apiRequest<{ download_url: string }>(`/mail/messages/${selected.mailbox_message_id}/original`);
      window.open(link.download_url, '_blank', 'noopener,noreferrer');
    } catch {
      setError(copy.mail.downloadFailed);
    }
  };

  const startReply = () => {
    if (!selected) return;
    setProblem('');
    setComposer({ ...blank(activeBoxId), to: selected.from_address, subject: replySubject(selected.subject), body: '', quotedHtml: quotePreview(detail, selected.from_address), inReplyTo: detail?.message_id_header || selected.message_id, quote: { kind: 'reply', source_id: selected.mailbox_message_id } });
  };

  const startReplyAll = () => {
    if (!selected) return;
    const ownAddress = boxes.find((box) => box.id === activeBoxId)?.address.toLowerCase() ?? '';
    const sender = selected.from_address.toLowerCase();
    const cc = [...new Set((detail?.recipients ?? [])
      .filter((recipient) => recipient.kind === 'to' || recipient.kind === 'cc')
      .map((recipient) => recipient.address)
      .filter((address) => address.toLowerCase() !== sender && address.toLowerCase() !== ownAddress))];
    setProblem('');
    setComposer({ ...blank(activeBoxId), to: selected.from_address, cc: cc.join(', '), subject: replySubject(selected.subject), quotedHtml: quotePreview(detail, selected.from_address), inReplyTo: detail?.message_id_header || selected.message_id, quote: { kind: 'reply_all', source_id: selected.mailbox_message_id } });
  };

  const startForward = (asAttachment = false) => {
    if (!selected) return;
    const prefix = 'Fwd:';
    const subject = /^Fwd:\s/i.test(selected.subject) ? selected.subject : `${prefix} ${selected.subject}`.trim();
    setProblem('');
    setComposer({
      ...blank(activeBoxId),
      subject,
      body: '',
      quotedHtml: quotePreview(detail, selected.from_address),
      quote: {
        kind: asAttachment ? 'forward_attachment' : 'forward',
        source_id: selected.mailbox_message_id,
        include_attachments: true,
      },
    });
  };

  const save = async (state: 'draft' | 'queued') => {
    if (!composer) return;
    const addresses = parseAddresses(composer.to);
    const cc = parseAddresses(composer.cc);
    const bcc = parseAddresses(composer.bcc);
    const bad = invalidAddresses([...addresses, ...cc, ...bcc]);
    if (bad.length) { setProblem(copy.mail.invalidRecipients.replace('{list}', bad.join(', '))); return; }
    if (state === 'queued' && addresses.length + cc.length + bcc.length === 0) { setProblem(copy.mail.needRecipient); return; }
    const record: MailDraft = { id: composer.id, ownerId, mailboxId: composer.mailboxId, to: addresses, cc, bcc, subject: composer.subject, body: composer.body, bodyHtml: composer.bodyHtml, bodyFormat: composer.bodyFormat ?? 'plain', quotedHtml: composer.quotedHtml, removeQuote: composer.removeQuote, inReplyTo: composer.inReplyTo, quote: composer.quote, serverDraftId: composer.serverDraftId, attachments: composer.attachments, state, savedAt: new Date().toISOString() };
    try {
      // A message to send is stored as a plain draft first; it only joins the send queue once the undo window passes.
      await putDraft(state === 'queued' ? { ...record, state: 'draft' } : record);
    } catch {
      setProblem(copy.mail.draftStoreError);
      return;
    }
    const snapshot = composer;
    setComposer(null);
    setProblem('');
    await reloadDrafts();
    if (state === 'draft') { setNotice(copy.mail.draftSaved); return; }
    startUndoWindow(record, snapshot);
  };

  // Undo send: hold the stored draft for a few seconds before it is queued.
  const [undo, setUndo] = useState<{ record: MailDraft; snapshot: ComposeState } | null>(null);
  const undoRef = useRef<{ record: MailDraft; snapshot: ComposeState } | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);
  const releaseSend = async (record: MailDraft) => {
    await putDraft({ ...record, state: 'queued', savedAt: new Date().toISOString() });
    await reloadDrafts();
    if (navigator.onLine) void flush();
    else setNotice(copy.mail.queued);
  };
  const flushUndo = () => {
    window.clearTimeout(undoTimer.current);
    const item = undoRef.current;
    undoRef.current = null;
    setUndo(null);
    if (item) void releaseSend(item.record);
  };
  const startUndoWindow = (record: MailDraft, snapshot: ComposeState) => {
    window.clearTimeout(undoTimer.current);
    if (undoRef.current) void releaseSend(undoRef.current.record);
    undoRef.current = { record, snapshot };
    setUndo(undoRef.current);
    undoTimer.current = window.setTimeout(flushUndo, 8000);
  };
  const undoSend = () => {
    window.clearTimeout(undoTimer.current);
    const item = undoRef.current;
    undoRef.current = null;
    setUndo(null);
    if (item) setComposer(item.snapshot);
  };
  // Leaving the screen inside the window sends the message rather than leaving it as a draft.
  useEffect(() => () => { window.clearTimeout(undoTimer.current); const item = undoRef.current; undoRef.current = null; if (item) void putDraft({ ...item.record, state: 'queued' }); }, []);

  const editDraft = (draft: MailDraft) => {
    setProblem('');
    setComposer({ id: draft.id, mailboxId: draft.mailboxId, to: draft.to.join(', '), cc: (draft.cc ?? []).join(', '), bcc: (draft.bcc ?? []).join(', '), subject: draft.subject, body: draft.body, bodyHtml: draft.bodyHtml, bodyFormat: draft.bodyFormat ?? (draft.bodyHtml ? 'html' : 'plain'), quotedHtml: draft.quotedHtml, removeQuote: draft.removeQuote, inReplyTo: draft.inReplyTo, quote: draft.quote, serverDraftId: draft.serverDraftId, attachments: (draft.attachments ?? []).map((file) => ({ id: file.id, filename: file.filename, size: file.size, size_bytes: file.size, content_type: file.content_type ?? 'application/octet-stream', scan_state: file.scan_state ?? 'unscanned', sha256: file.sha256 ?? null, disposition: file.disposition ?? 'attachment', content_id: file.content_id ?? null, blocked_reason: file.blocked_reason ?? null, scan_detail: file.scan_detail ?? null, scanned_at: file.scanned_at ?? null })) });
  };
  const discardDraft = async (draft: MailDraft) => {
    await removeDraft(draft.id);
    if (draft.serverDraftId && navigator.onLine) { try { await apiRequest(`/mail/drafts/${draft.serverDraftId}`, { method: 'DELETE' }); } catch { /* The server copy is only a draft; it expires with the mailbox. */ } }
    await reloadDrafts();
  };
  const sendNow = async (draft: MailDraft) => { await putDraft({ ...draft, state: 'queued' }); await reloadDrafts(); void flush(); };

  const [attaching, setAttaching] = useState(false);
  const attach = async (files: File[], disposition: 'attachment' | 'inline' = 'attachment'): Promise<string | null> => {
    if (!composer || files.length === 0) return null;
    if (!navigator.onLine) { setProblem(copy.mail.attachOffline); return null; }
    const addresses = parseAddresses(composer.to);
    const cc = parseAddresses(composer.cc);
    const bcc = parseAddresses(composer.bcc);
    const bad = invalidAddresses([...addresses, ...cc, ...bcc]);
    if (bad.length) { setProblem(copy.mail.invalidRecipients.replace('{list}', bad.join(', '))); return null; }
    setAttaching(true);
    setProblem('');
    let current = composer;
    let firstContentId: string | null = null;
    try {
      const content = JSON.stringify({
        mailbox_id: current.mailboxId, to: addresses, cc, bcc, subject: current.subject,
        format: current.bodyFormat ?? (current.bodyHtml ? 'html' : 'plain'),
        body_text: current.body, body_html: current.bodyHtml ?? null,
        in_reply_to: current.inReplyTo ?? null,
        ...(current.removeQuote ? { remove_quote: true } : current.serverDraftId || !current.quote ? {} : { quote: current.quote }),
      });
      let serverId = current.serverDraftId;
      if (serverId) await apiRequest(`/mail/drafts/${serverId}`, { method: 'PUT', body: content });
      else serverId = (await apiRequest<{ id: string; quoted_html?: string | null }>('/mail/drafts', { method: 'POST', body: content })).id;
      current = { ...current, serverDraftId: serverId };
      for (const file of files) {
        try {
          const result = await uploader.upload(current.mailboxId, file, serverId, { disposition });
          if (!firstContentId && result.content_id) firstContentId = result.content_id;
          current = {
            ...current,
            attachments: [...current.attachments, {
              id: result.id, filename: result.filename, size: result.size_bytes, size_bytes: result.size_bytes, content_type: result.content_type,
              scan_state: result.scan_state, sha256: result.sha256, disposition: result.disposition,
              content_id: result.content_id, blocked_reason: null,
            }],
          };
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
    return firstContentId ? `cid:${firstContentId}` : null;
  };
  const pasteImage = async (file: File) => attach([file], 'inline');

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
        {drafts.filter((draft) => draft.id !== undo?.record.id).map((draft) => <li key={draft.id}>
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
        <PillButton type="button" tone="ghost" size="sm" showArrow={false} onClick={startReplyAll} disabled={!online}>{copy.mail.replyAll}</PillButton>
        <PillButton type="button" tone="ghost" size="sm" showArrow={false} onClick={() => startForward(false)} disabled={!online}>{copy.mail.forward}</PillButton>
        <PillButton type="button" tone="ghost" size="sm" showArrow={false} onClick={() => startForward(true)} disabled={!online}>{copy.mail.forwardAsAttachment}</PillButton>
        <PillButton type="button" tone="ghost" size="sm" showArrow={false} disabled={!online} onClick={() => void change(selected, { is_starred: !selected.is_starred })}>{selected.is_starred ? copy.mail.unstar : copy.mail.star}</PillButton>
        <PillButton type="button" tone="ghost" size="sm" showArrow={false} disabled={!online} onClick={() => void change(selected, { is_read: false }, true)}>{copy.mail.markUnread}</PillButton>
        <PillButton type="button" tone="ghost" size="sm" showArrow={false} disabled={!online} onClick={() => void change(selected, { folder: folder === 'trash' || folder === 'spam' ? 'inbox' : 'trash' }, true)}>{folder === 'trash' || folder === 'spam' ? copy.mail.restore : copy.mail.trash}</PillButton>
      </div>
      <h3>{selected.subject || copy.mail.noSubject}</h3>
      {selected.origin === 'inbound' && <Banner tone="warn">{copy.mail.externalBanner}</Banner>}
      <p className="mail-meta">{copy.mail.from}: {selected.from_name ? `${selected.from_name} <${selected.from_address}>` : selected.from_address}</p>
      <p className="mail-meta">{new Date(selected.received_at).toLocaleString()}</p>
      {!detail ? <p role="status">{copy.mail.loading}</p> : <NurseMailUiProvider><MailMessageView message={{
        mailbox_message_id: selected.mailbox_message_id,
        message_id: selected.message_id,
        folder,
        from_address: selected.from_address,
        from_name: selected.from_name,
        subject: selected.subject,
        body_format: detail.body_html ? 'html' : 'plain',
        body_text: detail.body_text ?? '',
        body_html: detail.body_html ?? null,
        quoted_html: detail.quoted_html ?? null,
        snippet: selected.snippet ?? '',
        recipients: detail.recipients.filter((recipient) => ['to', 'cc', 'bcc'].includes(recipient.kind)) as SharedMailMessage['recipients'],
        attachments: detail.attachments.map((file) => ({
          id: file.id, filename: file.filename, content_type: file.content_type ?? 'application/octet-stream',
          size_bytes: file.size_bytes, sha256: file.sha256 ?? null, scan_state: file.scan_state ?? 'unscanned',
          disposition: file.disposition ?? 'attachment', content_id: file.content_id ?? null,
          blocked_reason: file.blocked_reason ?? null, scan_detail: file.scan_detail ?? null, scanned_at: file.scanned_at ?? null,
        })),
        render_notes: detail.render_notes ?? {}, has_remote_images: Boolean(detail.has_remote_images),
        can_download_original: Boolean(detail.can_download_original), delivery: detail.delivery ?? null,
      }} onDownload={(attachment) => void download(attachment.id)} onDownloadOriginal={() => void downloadOriginal()}
        onExternalLink={(url) => setExternalLink(url)} showRemoteImages={() => undefined} /></NurseMailUiProvider>}
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

    {externalLink ? (
      <Sheet labelledBy="mail-external-link-title" placement="center" role="alertdialog">
        <h2 id="mail-external-link-title">{copy.mail.externalLinkTitle}</h2>
        <p>{copy.mail.externalLinkPrompt.replace('{host}', new URL(externalLink).hostname)}</p>
        <SheetActions>
          <PillButton tone="forest" showArrow={false} onClick={() => { window.open(externalLink, '_blank', 'noopener,noreferrer'); setExternalLink(null); }}>{copy.mail.externalLinkContinue}</PillButton>
          <PillButton tone="ghost" showArrow={false} onClick={() => setExternalLink(null)}>{copy.generic.cancel}</PillButton>
        </SheetActions>
      </Sheet>
    ) : null}
    {undo && <div className="mail-undo-bar" role="status" aria-live="polite"><span>Sending…</span><PillButton type="button" tone="ghost" size="sm" showArrow={false} onClick={undoSend}>Undo</PillButton><PillButton type="button" tone="ghost" size="sm" showArrow={false} onClick={flushUndo}>Send now</PillButton></div>}
    {composer && <MailComposeSheet value={composer} problem={problem} online={online} attaching={attaching} onAttach={(files) => void attach(files)} onPasteImage={pasteImage} onRemoveAttachment={(id) => void removeAttachment(id)} onChange={(next) => { setComposer(next); setProblem(''); }} onSend={() => void save('queued')} onSaveDraft={() => void save('draft')} onCancel={() => setComposer(null)} onDiscard={(value) => { void (async () => { await removeDraft(value.id); if (value.serverDraftId && navigator.onLine) { try { await apiRequest(`/mail/drafts/${value.serverDraftId}`, { method: 'DELETE' }); } catch { /* Local discard must still succeed. */ } } setComposer(null); await reloadDrafts(); })(); }} />}
  </section>;
}
