import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ButtonGroup } from '@shared/components/dialogs/ButtonGroup';
import { Modal } from '@shared/components/dialogs/Modal';
import { FilterBar } from '../../../components/admin/FilterBar';
import { Notice } from '@shared/components/dialogs/Notice';
import { SectionHeader } from '@shared/components/dialogs/SectionHeader';
import { Button } from '@shared/components/ui/Button';
import { Checkbox } from '@shared/components/ui/Checkbox';
import { Field } from '@shared/components/ui/Field';
import { apiClient } from '@shared/lib/api/client';
import pageStyles from './MailPage.module.css';
import styles from './MailboxAdminSection.module.css';

type AdminMailbox = {
  id: string;
  address: string;
  local_part: string;
  kind: 'personal' | 'shared';
  state: 'open' | 'closed';
  display_name: string;
  owner: { id: string; name: string; email: string; is_active: boolean } | null;
  orphan: boolean;
  aliases: string[];
  members: number;
  total: number;
  real: number;
  inbox: number;
  sent: number;
  drafts: number;
  has_content: boolean;
  last_activity: string | null;
  legal_hold: boolean;
  can_delete: boolean;
  delete_blocked_reason: string | null;
};
type Listing = { mailboxes: AdminMailbox[]; assignable_users: { id: string; name: string; email: string }[]; domain: string };
type Preview = { messages: { folder: string; at: string; subject: string; from: string; system: boolean }[] };
type Action = { kind: 'rename' | 'reassign' | 'delete'; box: AdminMailbox };

const errorText = (error: unknown) => (error instanceof Error && error.message ? error.message : 'The request failed.');

/** Every taken mail address, whether it holds real mail, and what can be done with it. Mounted only after TOTP. */
/** Loads on click, so the authenticator pop-up appears first and the list only shows once the code is accepted. */
export function MailboxAdminSection() {
  const client = useQueryClient();
  const [unlocked, setUnlocked] = useState(false);
  const [filter, setFilter] = useState('');
  const [onlyOrphans, setOnlyOrphans] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [value, setValue] = useState('');
  const [moveTo, setMoveTo] = useState('');
  const [purge, setPurge] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const list = useQuery({
    queryKey: ['mail', 'admin-mailboxes'],
    queryFn: () => apiClient.get<Listing>('/mail/admin/mailboxes'),
    enabled: unlocked,
    retry: false,
  });
  const preview = useQuery({
    queryKey: ['mail', 'admin-mailbox-preview', open],
    queryFn: () => apiClient.get<Preview>(`/mail/admin/mailboxes/${open}/preview`),
    enabled: unlocked && Boolean(open),
    retry: false,
  });

  const close = () => { setAction(null); setValue(''); setMoveTo(''); setPurge(false); };
  const done = (text: string) => { setMessage({ tone: 'success', text }); close(); void client.invalidateQueries({ queryKey: ['mail'] }); };
  const fail = (error: unknown) => setMessage({ tone: 'error', text: errorText(error) });

  const run = useMutation({
    mutationFn: async () => {
      if (!action) return;
      const base = `/mail/admin/mailboxes/${action.box.id}`;
      if (action.kind === 'rename') return apiClient.patch(`${base}/rename`, { local_part: value });
      if (action.kind === 'reassign') return apiClient.post(`${base}/reassign`, { user_id: value });
      return apiClient.post(`${base}/delete`, { confirm: value, move_to_mailbox_id: moveTo || null, purge });
    },
    onSuccess: () => done(action?.kind === 'delete' ? 'Mailbox deleted.' : action?.kind === 'rename' ? 'Address renamed.' : 'Mailbox reassigned.'),
    onError: fail,
  });

  const needle = filter.trim().toLowerCase();
  const rows = (list.data?.mailboxes ?? []).filter((box) =>
    (!onlyOrphans || box.orphan) &&
    (!needle || `${box.address} ${box.owner?.name ?? ''} ${box.owner?.email ?? ''} ${box.aliases.join(' ')}`.toLowerCase().includes(needle)));
  const moveTargets = (list.data?.mailboxes ?? []).filter((box) => box.state === 'open' && box.id !== action?.box.id);
  const needsChoice = action?.kind === 'delete' && action.box.has_content && !moveTo && !purge;

  return (
    <section className={pageStyles.panel} aria-label="Mailboxes and addresses">
      <SectionHeader
        title="Mailboxes and addresses"
        actions={unlocked ? <Button variant="outline" size="compact" onClick={() => void list.refetch()}>Refresh</Button> : undefined}
      />
      {!unlocked ? (
        <Button variant="outline" onClick={() => setUnlocked(true)}>Manage mailboxes</Button>
      ) : (
        <>
          {message ? <Notice tone={message.tone} floating onDismiss={() => setMessage(null)}>{message.text}</Notice> : null}
          {list.isError ? <Notice tone="error">{errorText(list.error)}</Notice> : null}
          <FilterBar
            label="Mailbox filters"
            actions={(
              <Button variant={onlyOrphans ? 'primary' : 'outline'} onClick={() => setOnlyOrphans((current) => !current)}>
                {onlyOrphans ? 'Showing orphans only' : 'Show orphans only'}
              </Button>
            )}
          >
            <Field label="Search addresses or owners" value={filter} onChange={(event) => setFilter(event.target.value)} />
          </FilterBar>
          <div className={styles.list}>
            {rows.map((box) => (
              <div key={box.id} className={styles.row}>
                <div className={styles.head}>
                  <span className={styles.addr}>{box.address}</span>
                  <span className={styles.tags}>
                    <span className={styles.tag}>{box.kind}</span>
                    <span className={styles.tag}>{box.state}</span>
                    {box.orphan ? <span className={`${styles.tag} ${styles.warn}`}>owner deleted</span> : null}
                    {box.legal_hold ? <span className={`${styles.tag} ${styles.warn}`}>legal hold</span> : null}
                  </span>
                </div>
                <div className={styles.meta}>
                  {box.owner ? `Owner: ${box.owner.name} (${box.owner.email})${box.owner.is_active ? '' : ' – inactive'}` : box.kind === 'shared' ? `Shared · ${box.members} member(s)` : 'No owner'}
                  {box.aliases.length ? ` · Aliases: ${box.aliases.join(', ')}` : ''}
                </div>
                <div className={styles.meta}>
                  {box.has_content
                    ? `Has mail: ${box.inbox} inbox · ${box.sent} sent · ${box.drafts} drafts · ${box.real} real of ${box.total} total${box.last_activity ? ` · last ${new Date(box.last_activity).toLocaleString()}` : ''}`
                    : `No real mail${box.total ? ' (welcome message only)' : ''}`}
                </div>
                <div className={styles.actions}>
                  <Button variant="outline" size="compact" onClick={() => setOpen(open === box.id ? null : box.id)}>{open === box.id ? 'Hide mail' : 'View mail'}</Button>
                  <Button variant="outline" size="compact" onClick={() => { setAction({ kind: 'rename', box }); setValue(box.local_part); }}>Rename</Button>
                  {box.kind === 'personal' ? <Button variant="outline" size="compact" onClick={() => { setAction({ kind: 'reassign', box }); setValue(''); }}>Reassign</Button> : null}
                  <Button variant="outline" size="compact" disabled={!box.can_delete} onClick={() => { setAction({ kind: 'delete', box }); setValue(''); }}>Delete</Button>
                </div>
                {!box.can_delete && box.delete_blocked_reason ? <div className={styles.meta}>{box.delete_blocked_reason}</div> : null}
                {open === box.id ? (
                  preview.isError ? <Notice tone="error">{errorText(preview.error)}</Notice> : (
                    <ul className={styles.preview}>
                      {(preview.data?.messages ?? []).map((m, index) => (
                        <li key={`${m.at}-${index}`}>{new Date(m.at).toLocaleDateString()} · {m.folder} · {m.system ? 'system' : m.from} · {m.subject}</li>
                      ))}
                      {preview.data && preview.data.messages.length === 0 ? <li>Empty.</li> : null}
                    </ul>
                  )
                ) : null}
              </div>
            ))}
            {list.data && rows.length === 0 ? <p className={pageStyles.settingHelp}>No addresses match.</p> : null}
          </div>
        </>
      )}

      {action ? (
        <Modal
          id="mailbox-admin-title"
          title={action.kind === 'delete' ? `Delete ${action.box.address}` : action.kind === 'rename' ? `Rename ${action.box.address}` : `Reassign ${action.box.address}`}
          subtitle={action.kind === 'rename' ? `Choose the part before @${list.data?.domain ?? ''}. No alias is kept for the old name.` : action.kind === 'reassign' ? 'Give this mailbox, with all its mail, to a user who has no personal mailbox yet.' : action.box.has_content ? `This mailbox holds ${action.box.real} real message(s).` : 'This mailbox holds no real mail.'}
          onClose={close}
          closeLabel="Cancel"
        >
          {action.kind === 'rename' ? (
            <Field label="New address (before the @)" value={value} maxLength={64} onChange={(event) => setValue(event.target.value)} />
          ) : null}
          {action.kind === 'reassign' ? (
            <Field kind="select" label="New owner" value={value} onChange={(event) => setValue(event.target.value)}>
              <option value="">Choose a user…</option>
              {(list.data?.assignable_users ?? []).map((user) => <option key={user.id} value={user.id}>{user.name} ({user.email})</option>)}
            </Field>
          ) : null}
          {action.kind === 'delete' ? (
            <>
              {action.box.has_content ? (
                <>
                  <Field kind="select" label="Move its mail to" value={moveTo} onChange={(event) => { setMoveTo(event.target.value); if (event.target.value) setPurge(false); }}>
                    <option value="">Do not move (see below)</option>
                    {moveTargets.map((box) => <option key={box.id} value={box.id}>{box.address}</option>)}
                  </Field>
                  {!moveTo ? (
                    <Checkbox
                      checked={purge}
                      onChange={(event) => setPurge(event.target.checked)}
                      label="Permanently delete the mail in this mailbox"
                    />
                  ) : null}
                </>
              ) : null}
              <Field label={`Type ${action.box.address} to confirm`} value={value} onChange={(event) => setValue(event.target.value)} />
            </>
          ) : null}
          <ButtonGroup spaced>
            <Button
              disabled={run.isPending || !value.trim() || Boolean(needsChoice)}
              onClick={() => run.mutate()}
            >
              {action.kind === 'delete' ? 'Delete mailbox' : action.kind === 'rename' ? 'Rename' : 'Reassign'}
            </Button>
          </ButtonGroup>
        </Modal>
      ) : null}
    </section>
  );
}
