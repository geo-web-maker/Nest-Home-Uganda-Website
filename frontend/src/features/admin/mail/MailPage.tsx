import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { ButtonGroup } from '../../../components/admin/ButtonGroup';
import { FilterTabs } from '../../../components/admin/FilterTabs';
import { Modal } from '../../../components/admin/Modal';
import { Notice } from '../../../components/admin/Notice';
import { PageHeader } from '../../../components/admin/PageHeader';
import { SearchBar } from '../../../components/admin/SearchBar';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { apiClient } from '../../../lib/api/client';
import { MailCompose } from './MailCompose';
import { MAIL_CHANGED_EVENT } from './useMailUnread';
import { useMailPush } from './useMailPush';
import { buildSeed, type SeedKind } from './recipients';
import { FOLDERS, type ComposeSeed, type Folder, type MailDetail, type MailItem, type Mailbox } from './types';
import { MailMessageView } from '../../../shared/mail-rich/react/MailMessageView';
import { MessageActionBar } from '../../../shared/mail-rich/react/MessageActionBar';
import type { MailMessageView as SharedMailMessage } from '../../../shared/mail-rich/core/types';
import { AdminMailUiProvider } from './mailUiKit';
import '../../../shared/mail-rich/react/mail-rich.css';
import styles from './MailPage.module.css';

const UNDO_SEND_MS = 8000;
type PendingSend = { draftId: string; mailboxId: string; seed: ComposeSeed };
const EMPTY_SEED: ComposeSeed = { to: [], cc: [], bcc: [], subject: '', body: '' };

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName)));
}

export function MailPage() {
  const { t } = useTranslation('admin');
  const client = useQueryClient();
  const [mailboxChoice, setMailboxChoice] = useState('');
  const [folder, setFolder] = useState<Folder>('inbox');
  const [query, setQuery] = useState('');
  const [moreSlot, setMoreSlot] = useState<HTMLElement | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [seed, setSeed] = useState<ComposeSeed | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [externalLink, setExternalLink] = useState<string | null>(null);
  const markedRead = useRef(new Set<string>());
  const location = useLocation();
  const navigate = useNavigate();

  const boxes = useQuery({
    queryKey: ['mail', 'mailboxes'],
    queryFn: () => apiClient.get<{ items: Mailbox[] }>('/mail/mailboxes'),
  });
  const mailboxes = boxes.data?.items ?? [];
  useEffect(() => {
    if (boxes.data) window.dispatchEvent(new Event(MAIL_CHANGED_EVENT));
  }, [boxes.data]);
  const mailboxId = mailboxChoice || mailboxes[0]?.id || '';
  const mailbox = mailboxes.find((box) => box.id === mailboxId);

  const list = useQuery({
    queryKey: ['mail', 'messages', mailboxId, folder, query],
    enabled: Boolean(mailboxId),
    queryFn: () =>
      apiClient.get<{ items: MailItem[] }>(`/mail/mailboxes/${mailboxId}/messages`, {
        params: { folder, q: query || undefined },
      }),
  });
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const selected = items.find((item) => item.mailbox_message_id === selectedId);

  const detail = useQuery({
    queryKey: ['mail', 'message', selectedId],
    enabled: Boolean(selectedId),
    queryFn: () => apiClient.get<MailDetail>(`/mail/messages/${selectedId}`),
  });

  // Opening a message marks it read on the server; refresh the list and unread counts once per message.
  useEffect(() => {
    if (!detail.data || !selected || selected.is_read || markedRead.current.has(selectedId)) return;
    markedRead.current.add(selectedId);
    void client.invalidateQueries({ queryKey: ['mail', 'messages'] });
    void client.invalidateQueries({ queryKey: ['mail', 'mailboxes'] });
  }, [detail.data, selected, selectedId, client]);

  const refreshAll = () => client.invalidateQueries({ queryKey: ['mail'] });

  const change = useMutation({
    mutationFn: (input: { id: string; changes: Record<string, unknown>; leaves?: boolean }) =>
      apiClient.patch(`/mail/messages/${input.id}`, input.changes),
    onSuccess: async (_data, input) => {
      if (input.leaves) setSelectedId('');
      await refreshAll();
    },
    onError: () => setNotice({ tone: 'error', text: t('mail.actionError') }),
  });
  const spam = useMutation({
    mutationFn: (id: string) => apiClient.post(`/mail/messages/${id}/report-spam`),
    onSuccess: async () => {
      setSelectedId('');
      await refreshAll();
    },
    onError: () => setNotice({ tone: 'error', text: t('mail.actionError') }),
  });

  const pick = (id: string) => {
    setNotice(null);
    setSelectedId(id);
  };
  const chooseFolder = (value: string) => {
    setFolder(value as Folder);
    setSelectedId('');
  };

  const shown = detail.data && selected ? { ...selected, ...detail.data } : null;
  const sharedMessage: SharedMailMessage | null = shown ? {
    mailbox_message_id: shown.mailbox_message_id,
    message_id: shown.message_id,
    folder: shown.folder,
    from_address: shown.from_address,
    from_name: shown.from_name,
    subject: shown.subject,
    body_format: shown.body_format ?? (shown.body_html ? 'html' : 'plain'),
    body_text: shown.body_text ?? '',
    body_html: shown.body_html ?? null,
    quoted_html: shown.quoted_html ?? null,
    snippet: shown.snippet ?? '',
    recipients: shown.recipients,
    attachments: shown.attachments.map((item) => ({
      id: item.id, filename: item.filename, content_type: item.content_type,
      size_bytes: item.size_bytes, sha256: item.sha256 ?? null,
      scan_state: item.scan_state ?? 'unscanned', disposition: item.disposition ?? 'attachment',
      content_id: item.content_id ?? null, blocked_reason: item.blocked_reason ?? null,
      scan_detail: item.scan_detail ?? null, scanned_at: item.scanned_at ?? null,
    })),
    render_notes: shown.render_notes ?? {},
    has_remote_images: Boolean(shown.has_remote_images),
    can_download_original: Boolean(shown.can_download_original),
    delivery: shown.delivery ?? null,
  } : null;

  const compose = (next: ComposeSeed) => {
    if (mailboxId) setSeed(next);
  };
  // Opened from elsewhere (for example an enquiry's "Email client" button) with a ready-made
  // recipient and subject. Consumed once, then cleared so a refresh does not reopen it.
  useEffect(() => {
    const handoff = (location.state as { compose?: { to?: string[]; subject?: string } } | null)?.compose;
    if (!handoff || !mailboxId) return;
    setSeed({ ...EMPTY_SEED, to: handoff.to ?? [], subject: handoff.subject ?? '' });
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, mailboxId, navigate]);
  const seedFor = (kind: SeedKind) => {
    if (!shown || !mailbox) return;
    const seed = buildSeed(kind, shown, {
      me: mailbox.address,
      date: new Date(selected?.received_at ?? Date.now()).toLocaleString(),
      wroteOn: (who, date) => t('mail.wroteOn', { who, date }),
      forwardedHeader: t('mail.forwardedHeader'),
    });
    const quoteKind = kind === 'replyAll' ? 'reply_all' : kind;
    compose({
      ...seed,
      quote: { kind: quoteKind, source_id: shown.mailbox_message_id, include_attachments: true },
    });
  };
  const forwardAsAttachment = () => {
    if (!shown || !mailbox) return;
    const seed = buildSeed('forward', shown, {
      me: mailbox.address,
      date: new Date(selected?.received_at ?? Date.now()).toLocaleString(),
      wroteOn: (who, date) => t('mail.wroteOn', { who, date }),
      forwardedHeader: t('mail.forwardedHeader'),
    });
    compose({ ...seed, quote: { kind: 'forward_attachment', source_id: shown.mailbox_message_id } });
  };

  const editDraft = () => {
    if (!shown) return;
    const pickAddresses = (kind: 'to' | 'cc' | 'bcc') =>
      shown.recipients.filter((recipient) => recipient.kind === kind).map((recipient) => recipient.address);
    compose({
      draftId: selectedId,
      to: pickAddresses('to'),
      cc: pickAddresses('cc'),
      bcc: pickAddresses('bcc'),
      subject: shown.subject,
      body: shown.body_text,
      bodyHtml: shown.body_html ?? undefined,
      bodyFormat: shown.body_format ?? 'plain',
      quotedHtml: shown.quoted_html ?? null,
      attachments: shown.attachments.map((file) => ({ ...file, size: file.size_bytes })),
    });
  };

  const download = async (attachmentId: string) => {
    try {
      const link = await apiClient.get<{ download_url: string }>(`/mail/attachments/${attachmentId}/download`);
      window.open(link.download_url, '_blank', 'noopener,noreferrer');
    } catch {
      setNotice({ tone: 'error', text: t('mail.downloadFailed') });
    }
  };

  const downloadOriginal = async () => {
    if (!selectedId) return;
    try {
      const link = await apiClient.get<{ download_url: string }>(`/mail/messages/${selectedId}/original`);
      window.open(link.download_url, '_blank', 'noopener,noreferrer');
    } catch {
      setNotice({ tone: 'error', text: t('mail.downloadFailed') });
    }
  };

  const retryDelivery = async () => {
    if (!selectedId) return;
    try {
      await apiClient.post(`/mail/messages/${selectedId}/retry-delivery`);
      setNotice({ tone: 'success', text: t('mail.retryQueued') });
      await refreshAll();
    } catch {
      setNotice({ tone: 'error', text: t('mail.retryFailed') });
    }
  };

  const openExternalLink = (url: string) => {
    setExternalLink(url);
  };

  // Keyboard shortcuts. Ignored while typing, while a dialog is open, and with any modifier key held.
  const shortcuts = useRef<(event: KeyboardEvent) => void>(() => undefined);
  shortcuts.current = (event) => {
    if (seed || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
    const index = items.findIndex((item) => item.mailbox_message_id === selectedId);
    if (event.key === 'c') {
      event.preventDefault();
      compose(EMPTY_SEED);
    } else if (event.key === 'j' || event.key === 'k') {
      const next = items[event.key === 'j' ? index + 1 : index - 1];
      if (next) pick(next.mailbox_message_id);
    } else if (selected && event.key === 'r') {
      seedFor('reply');
    } else if (selected && event.key === 's') {
      change.mutate({ id: selectedId, changes: { is_starred: !selected.is_starred } });
    } else if (selected && event.key === '#') {
      change.mutate({ id: selectedId, changes: { folder: 'trash' }, leaves: true });
    }
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => shortcuts.current(event);
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const tabs = FOLDERS.map((value) => ({
    value,
    label:
      value === 'inbox' && mailbox && mailbox.unread_count > 0
        ? `${t('mail.folders.inbox')} (${mailbox.unread_count})`
        : t(`mail.folders.${value}`),
  }));

  const onDone = (outcome: 'sent' | 'saved' | 'deleted') => {
    setSeed(null);
    setNotice({ tone: 'success', text: t(outcome === 'sent' ? 'mail.sent' : outcome === 'saved' ? 'mail.draftSaved' : 'mail.draftDiscarded') });
    void refreshAll();
  };

  // Undo send: the message is already saved as a draft; it is only sent once the undo window passes.
  const [pending, setPending] = useState<PendingSend | null>(null);
  const pendingRef = useRef<PendingSend | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const dispatchSend = async (item: PendingSend) => {
    try {
      // Sending is idempotent on the server (a draft already sent answers "already_sent"), so a dropped
      // connection is retried instead of failing a message that may have gone through.
      let attempt = 0;
      for (;;) {
        try {
          await apiClient.post(`/mail/drafts/${item.draftId}/send`, { mailbox_id: item.mailboxId });
          break;
        } catch (failure) {
          const dropped = failure instanceof Error && 'status' in failure && (failure as { status?: number }).status === 0;
          if (!dropped || attempt >= 2) throw failure;
          attempt += 1;
          await new Promise((resolve) => window.setTimeout(resolve, 1500 * attempt));
        }
      }
      setNotice({ tone: 'success', text: t('mail.sent') });
      void refreshAll();
    } catch (cause) {
      // The message stays in Drafts; the reason is shown on the page (the composer is closed).
      const dropped = cause instanceof Error && (cause as { status?: number }).status === 0;
      const reason = dropped ? 'The server did not answer the send request, so the message may not have been sent.' : cause instanceof Error && cause.message ? cause.message : t('mail.sendError');
      setNotice({ tone: 'error', text: `${reason} Your message is saved in Drafts.` });
      void refreshAll();
    }
  };
  const flushPending = () => {
    window.clearTimeout(timer.current);
    const item = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (item) void dispatchSend(item);
  };
  const startSend = (item: PendingSend) => {
    window.clearTimeout(timer.current);
    if (pendingRef.current) void dispatchSend(pendingRef.current);
    pendingRef.current = item;
    setSeed(null);
    setNotice(null);
    setPending(item);
    timer.current = window.setTimeout(flushPending, UNDO_SEND_MS);
  };
  const undoSend = () => {
    window.clearTimeout(timer.current);
    const item = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (item) setSeed(item.seed);
  };
  // Leaving the page or closing the tab inside the window sends the message instead of stranding it.
  useEffect(() => {
    const leave = () => { const item = pendingRef.current; if (item) { pendingRef.current = null; void apiClient.post(`/mail/drafts/${item.draftId}/send`, { mailbox_id: item.mailboxId }); } };
    window.addEventListener('pagehide', leave);
    return () => { window.removeEventListener('pagehide', leave); window.clearTimeout(timer.current); leave(); };
  }, []);

  const push = useMailPush(true);
  const loadFailed = boxes.isError || list.isError;
  const noMailbox = boxes.isSuccess && mailboxes.length === 0;
  const inTrash = folder === 'trash' || folder === 'spam';

  return (
    <section aria-label={t('mail.title')}>
      <PageHeader
        title={t('mail.title')}
        actions={
          <ButtonGroup>
            <Button onClick={() => compose(EMPTY_SEED)} disabled={!mailboxId}>
              {t('mail.compose')}
            </Button>
            <Button variant="outline" onClick={() => void refreshAll()}>
              {t('mail.refresh')}
            </Button>
            {push.available ? (
              <Button variant="outline" disabled={push.busy || push.blocked} onClick={() => void push.toggle()}>
                {push.subscribed ? 'Notifications on' : push.blocked ? 'Notifications blocked' : 'Turn on notifications'}
              </Button>
            ) : null}
          </ButtonGroup>
        }
      />
      {push.error ? <Notice tone="error">{push.error}</Notice> : null}
      {loadFailed ? <Notice tone="error">{t('mail.error')}</Notice> : null}
      {noMailbox ? <Notice tone="info">{t('mail.noMailbox')}</Notice> : null}
      {notice ? <Notice tone={notice.tone} floating onDismiss={() => setNotice(null)}>{notice.text}</Notice> : null}

      <div className={styles.toolbar}>
        {mailboxes.length > 1 ? (
          <Field
            kind="select"
            label={t('mail.mailbox')}
            value={mailboxId}
            onChange={(event) => {
              setMailboxChoice(event.target.value);
              setSelectedId('');
            }}
          >
            {mailboxes.map((box) => (
              <option key={box.id} value={box.id}>
                {box.display_name} · {box.address}
              </option>
            ))}
          </Field>
        ) : null}
        <FilterTabs tabs={tabs} value={folder} onChange={chooseFolder} label={t('mail.folderLabel')} controls="mail-list" />
        <SearchBar
          label={t('mail.searchLabel')}
          searchLabel={t('mail.searchField')}
          buttonLabel={t('mail.searchButton')}
          placeholder={t('mail.searchPlaceholder')}
          value={query}
          onSearch={(text) => {
            setQuery(text);
            setSelectedId('');
          }}
        />
      </div>

      <div className={styles.layout} data-has-selection={selectedId ? 'true' : 'false'}>
        <div className={`${styles.panel} ${styles.listPanel}`}>
          <div id="mail-list" className={styles.list} role="list" aria-label={t('mail.messages')} aria-busy={list.isFetching}>
            {list.isLoading ? <p role="status">{t('mail.loading')}</p> : null}
            {list.isSuccess && items.length === 0 ? <p>{query ? t('mail.emptySearch') : t('mail.empty')}</p> : null}
            {items.map((item) => (
              <div role="listitem" key={item.mailbox_message_id}>
                <Button
                  variant="outline"
                  size="compact"
                  aria-pressed={item.mailbox_message_id === selectedId}
                  className={`${styles.row} ${item.is_read ? '' : styles.unread}`}
                  onClick={() => pick(item.mailbox_message_id)}
                >
                  <span className={styles.rowTop}>
                    <span className={styles.sender}>{item.from_name || item.from_address}</span>
                    {!item.is_read ? <Badge tone="new">{t('mail.unread')}</Badge> : null}
                  </span>
                  <span className={styles.subject}>{item.subject || t('mail.noSubject')}</span>
                  <span className={styles.meta}>
                    {item.is_starred ? '★ ' : ''}
                    {new Date(item.received_at).toLocaleString()}
                  </span>
                </Button>
              </div>
            ))}
          </div>
        </div>

        <article className={`${styles.panel} ${styles.readerPanel}`} aria-label={t('mail.reader')}>
          {!selectedId ? <p>{t('mail.select')}</p> : null}
          {selectedId && detail.isLoading ? <p role="status">{t('mail.loading')}</p> : null}
          {selectedId && detail.isError ? <Notice tone="error">{t('mail.error')}</Notice> : null}
          {shown ? (
            <div className={styles.reader}>
              <MessageActionBar
                labels={{ actions: t('mail.actions'), back: t('mail.backToList'), reply: t('mail.reply'), replyAll: t('mail.replyAll'), forward: t('mail.forward'), star: t('mail.star'), unstar: t('mail.unstar'), trash: t('mail.trash'), restore: t('mail.restore'), editDraft: t('mail.compose') }}
                isDraft={folder === 'drafts'}
                starred={Boolean(shown.is_starred)}
                restorable={inTrash}
                onBack={() => setSelectedId('')}
                onEditDraft={editDraft}
                onReply={() => seedFor('reply')}
                onReplyAll={() => seedFor('replyAll')}
                onForward={() => seedFor('forward')}
                onStar={() => change.mutate({ id: selectedId, changes: { is_starred: !shown.is_starred } })}
                onTrash={() => change.mutate({ id: selectedId, changes: { folder: 'trash' }, leaves: true })}
                onRestore={() => change.mutate({ id: selectedId, changes: { folder: 'inbox' }, leaves: true })}
                onMoreSlot={setMoreSlot}
              />
              <h2>{shown.subject || t('mail.noSubject')}</h2>
              {shown.origin === 'inbound' ? <Notice tone="info" role={null}>{t('mail.externalBanner')}</Notice> : null}
              <p className={styles.meta}>
                {t('mail.from')}: {shown.from_name ? `${shown.from_name} <${shown.from_address}>` : shown.from_address}
                <br />
                {(['to', 'cc', 'bcc'] as const).map((kind) => {
                  const addresses = shown.recipients.filter((recipient) => recipient.kind === kind);
                  return addresses.length ? (
                    <span key={kind}>
                      {t(`mail.${kind}`)}: {addresses.map((recipient) => recipient.address).join(', ')}
                      <br />
                    </span>
                  ) : null;
                })}
                {t('mail.date')}: {new Date(selected?.received_at ?? '').toLocaleString()}
              </p>
              {sharedMessage ? <AdminMailUiProvider labels={{
                attachments: t('mail.attachments'), download: t('mail.download'),
                remoteImagesBlocked: t('mail.remoteImagesBlocked'), showImages: t('mail.showRemoteImages'),
                downloadOriginal: t('mail.downloadOriginal'), from: t('mail.from'), to: t('mail.to'), cc: t('mail.cc'), date: t('mail.date'),
              }}><MailMessageView
                message={sharedMessage}
                onDownload={(attachment) => void download(attachment.id)}
                onDownloadOriginal={() => void downloadOriginal()}
                onExternalLink={openExternalLink}
                actions={[
                  ...(folder === 'drafts' ? [] : [{ key: 'forward-eml', label: t('mail.forwardAsAttachment'), onSelect: forwardAsAttachment }]),
                  { key: 'unread', label: t('mail.markUnread'), onSelect: () => change.mutate({ id: selectedId, changes: { is_read: false }, leaves: true }) },
                  ...(shown.origin === 'inbound' && folder !== 'spam' ? [{ key: 'spam', label: t('mail.reportSpam'), onSelect: () => spam.mutate(selectedId) }] : []),
                ]}
                showRemoteImages={() => undefined}
                onRetryDelivery={retryDelivery}
                moreSlot={moreSlot}
              /></AdminMailUiProvider> : null}
            </div>
          ) : null}
        </article>
      </div>
      <p className={styles.hint}>{t('mail.shortcuts')}</p>

      {externalLink ? (
        <Modal
          id="mail-external-link-title"
          title={t('mail.externalLinkTitle')}
          subtitle={t('mail.externalLinkPrompt', { host: new URL(externalLink).hostname })}
          onClose={() => setExternalLink(null)}
          closeLabel={t('mail.cancel')}
        >
          <ButtonGroup spaced>
            <Button
              onClick={() => {
                window.open(externalLink, '_blank', 'noopener,noreferrer');
                setExternalLink(null);
              }}
            >
              {t('mail.externalLinkContinue')}
            </Button>
          </ButtonGroup>
        </Modal>
      ) : null}
      {pending ? (
        <div className={styles.undoBar} role="status" aria-live="polite">
          <span>Sending… </span>
          <Button variant="outline" size="compact" onClick={undoSend}>Undo</Button>
          <Button variant="outline" size="compact" onClick={flushPending}>Send now</Button>
        </div>
      ) : null}
      {seed && mailboxId ? (
        <MailCompose mailboxId={mailboxId} seed={seed} onClose={() => setSeed(null)} onDone={onDone} onSendLater={startSend} />
      ) : null}
    </section>
  );
}
