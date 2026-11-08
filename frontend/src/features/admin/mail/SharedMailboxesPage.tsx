import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ButtonGroup } from '../../../components/admin/ButtonGroup';
import { Notice } from '../../../components/admin/Notice';
import { PageHeader } from '../../../components/admin/PageHeader';
import { SectionHeader } from '../../../components/admin/SectionHeader';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { apiClient, ApiError } from '../../../lib/api/client';
import styles from './MailPage.module.css';

export type SharedRole = 'owner' | 'send_as' | 'read_only';
export type SharedMember = { user_id: string; role: SharedRole; name?: string | null; email?: string | null; is_active?: boolean; missing?: boolean };
export type SharedPerson = { id: string; name: string; email: string };
export type SharedMailbox = { id: string; local_part: string; address: string; display_name: string; members: SharedMember[] };
type Message = { tone: 'success' | 'error'; text: string };

const ROLES: SharedRole[] = ['owner', 'send_as', 'read_only'];

/** Superadmin screen: create shared addresses such as info@ and assign several people to each. */
export function SharedMailboxesPage() {
  const { t } = useTranslation('admin');
  const client = useQueryClient();
  const [message, setMessage] = useState<Message | null>(null);
  const [localPart, setLocalPart] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [pick, setPick] = useState<Record<string, { user: string; role: SharedRole }>>({});

  const shared = useQuery({
    queryKey: ['mail', 'shared'],
    queryFn: () => apiClient.get<{ items: SharedMailbox[]; assignable_users?: SharedPerson[]; directory_ok?: boolean }>('/mail/shared'),
    retry: false,
  });
  const people = shared.data?.assignable_users ?? [];
  const directoryDown = shared.data?.directory_ok === false;
  /** Current name and email come from the server. A user who no longer exists is labelled, never shown as a raw id. */
  const nameOf = (member: SharedMember) => {
    if (directoryDown && !member.name && !member.email) return t('mailShared.unknownUser');
    if (member.missing || (!member.name && !member.email)) return t('mailShared.removedUser');
    return member.email ? `${member.name ?? member.email} (${member.email})` : String(member.name);
  };

  /** Show what the server said (for example "That user no longer exists"), falling back to the generic text. */
  const fail = (text: string, cause?: unknown) => {
    const detail = cause instanceof ApiError && cause.status !== 0 && cause.status < 500 && cause.message ? cause.message : '';
    setMessage({ tone: 'error', text: detail && detail !== text ? `${text} ${detail}` : text });
  };
  const ok = (text: string) => setMessage({ tone: 'success', text });
  const reload = () => client.invalidateQueries({ queryKey: ['mail', 'shared'] });

  const verify = useMutation({
    mutationFn: () => apiClient.post('/mail/totp/verify', { code: totpCode }),
    onSuccess: async () => {
      setTotpCode('');
      ok(t('mailShared.verified'));
      await reload();
    },
    onError: (cause) => fail(t('mailShared.verifyError'), cause),
  });
  const create = useMutation({
    mutationFn: () => apiClient.post('/mail/shared', { local_part: localPart.trim().toLowerCase(), display_name: displayName.trim() }),
    onSuccess: async () => {
      setLocalPart('');
      setDisplayName('');
      ok(t('mailShared.created'));
      await reload();
    },
    onError: (cause) => fail(t('mailShared.createError'), cause),
  });
  const assign = useMutation({
    mutationFn: (input: { mailboxId: string; userId: string; role: SharedRole }) =>
      apiClient.put(`/mail/shared/${input.mailboxId}/members/${input.userId}`, { role: input.role }),
    onSuccess: async () => {
      ok(t('mailShared.assigned'));
      await reload();
    },
    onError: async (cause) => {
      fail(t('mailShared.assignError'), cause);
      await reload(); // the list may be stale (user or mailbox changed); show the current state
    },
  });
  const unassign = useMutation({
    mutationFn: (input: { mailboxId: string; userId: string }) => apiClient.delete(`/mail/shared/${input.mailboxId}/members/${input.userId}`),
    onSuccess: async () => {
      ok(t('mailShared.removed'));
      await reload();
    },
    onError: async (cause) => {
      fail(t('mailShared.assignError'), cause);
      await reload(); // the list may be stale (user or mailbox changed); show the current state
    },
  });
  const close = useMutation({
    mutationFn: (mailboxId: string) => apiClient.post(`/mail/shared/${mailboxId}/close`, {}),
    onSuccess: async () => {
      ok(t('mailShared.closed'));
      await reload();
    },
    onError: async (cause) => {
      fail(t('mailShared.assignError'), cause);
      await reload(); // the list may be stale (user or mailbox changed); show the current state
    },
  });

  const pruneMissing = useMutation({
    mutationFn: async () => {
      const stale = (shared.data?.items ?? []).flatMap((box) => box.members.filter((member) => member.missing).map((member) => ({ mailboxId: box.id, userId: member.user_id })));
      for (const entry of stale) await apiClient.delete(`/mail/shared/${entry.mailboxId}/members/${entry.userId}`);
      return stale.length;
    },
    onSuccess: async () => {
      ok(t('mailShared.pruned'));
      await reload();
    },
    onError: async (cause) => {
      fail(t('mailShared.assignError'), cause);
      await reload();
    },
  });
  const missingCount = (shared.data?.items ?? []).reduce((total, box) => total + box.members.filter((member) => member.missing).length, 0);

  const canCreate = localPart.trim().length > 0 && displayName.trim().length > 0 && /^[a-zA-Z0-9.-]+$/.test(localPart.trim());
  const items = shared.data?.items ?? [];

  return (
    <>
      <PageHeader
        title={t('mailShared.title')}
        actions={
          <Button variant="outline" onClick={() => void reload()}>
            {t('mailShared.refresh')}
          </Button>
        }
      />
      {shared.isError ? <Notice tone="info">{t('mailShared.needsTotp')}</Notice> : null}
      {directoryDown ? (
        <Notice tone="error">
          {t('mailShared.directoryDown')}{' '}
          <Button variant="outline" size="compact" onClick={() => void reload()}>{t('mailShared.retry')}</Button>
        </Notice>
      ) : null}
      {!directoryDown && missingCount > 0 ? (
        <Notice tone="info">
          {t('mailShared.missingNotice', { count: missingCount })}{' '}
          <Button variant="outline" size="compact" disabled={pruneMissing.isPending} onClick={() => pruneMissing.mutate()}>
            {t('mailShared.pruneMissing')}
          </Button>
        </Notice>
      ) : null}
      {message ? <Notice tone={message.tone} floating onDismiss={() => setMessage(null)}>{message.text}</Notice> : null}
      <div className={styles.settingsStack}>
        {shared.isError ? (
          <section className={styles.panel} aria-label={t('mailShared.verifyTitle')}>
            <SectionHeader title={t('mailShared.verifyTitle')} />
            <Field label={t('mailShared.code')} value={totpCode} maxLength={32} autoComplete="one-time-code" onChange={(event) => setTotpCode(event.target.value)} />
            <ButtonGroup spaced>
              <Button disabled={!totpCode.trim() || verify.isPending} onClick={() => verify.mutate()}>
                {t('mailShared.verify')}
              </Button>
            </ButtonGroup>
          </section>
        ) : null}

        <section className={styles.panel} aria-label={t('mailShared.createTitle')}>
          <SectionHeader title={t('mailShared.createTitle')} />
          <Field label={t('mailShared.localPart')} value={localPart} maxLength={64} onChange={(event) => setLocalPart(event.target.value)} />
          <Field label={t('mailShared.displayName')} value={displayName} maxLength={160} onChange={(event) => setDisplayName(event.target.value)} />
          <ButtonGroup spaced>
            <Button disabled={!canCreate || create.isPending} onClick={() => create.mutate()}>
              {t('mailShared.create')}
            </Button>
          </ButtonGroup>
        </section>

        {!shared.isError && items.length === 0 ? <p className={styles.hint}>{t('mailShared.empty')}</p> : null}
        {items.map((box) => {
          const chosen = pick[box.id] ?? { user: '', role: 'send_as' as SharedRole };
          const free = people.filter((user) => !box.members.some((member) => member.user_id === user.id));
          return (
            <section className={styles.panel} key={box.id} aria-label={box.address}>
              <SectionHeader title={box.address} />
              <p className={styles.settingHelp}>{box.display_name}</p>
              {box.members.length === 0 ? <p className={styles.hint}>{t('mailShared.noMembers')}</p> : null}
              <ul className={styles.codes}>
                {box.members.map((member) => (
                  <li key={member.user_id}>
                    {nameOf(member)} · {t(`mailShared.role.${member.role}`)}{' '}
                    <Button
                      variant="outline"
                      size="compact"
                      onClick={() => unassign.mutate({ mailboxId: box.id, userId: member.user_id })}
                      aria-label={`${t('mailShared.remove')}: ${nameOf(member)} (${box.address})`}
                    >
                      {t('mailShared.remove')}
                    </Button>
                  </li>
                ))}
              </ul>
              <Field
                kind="select"
                label={`${t('mailShared.person')} (${box.address})`}
                value={chosen.user}
                onChange={(event) => setPick((current) => ({ ...current, [box.id]: { ...chosen, user: event.target.value } }))}
              >
                <option value="">{t('mailShared.choosePerson')}</option>
                {free.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </Field>
              <Field
                kind="select"
                label={`${t('mailShared.roleLabel')} (${box.address})`}
                value={chosen.role}
                onChange={(event) => setPick((current) => ({ ...current, [box.id]: { ...chosen, role: event.target.value as SharedRole } }))}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {t(`mailShared.role.${role}`)}
                  </option>
                ))}
              </Field>
              <ButtonGroup spaced>
                <Button
                  disabled={!chosen.user || assign.isPending || !people.some((user) => user.id === chosen.user)}
                  onClick={() => assign.mutate({ mailboxId: box.id, userId: chosen.user, role: chosen.role })}
                  aria-label={`${t('mailShared.assign')} (${box.address})`}
                >
                  {t('mailShared.assign')}
                </Button>
                <Button variant="outline" onClick={() => close.mutate(box.id)} aria-label={`${t('mailShared.close')} (${box.address})`}>
                  {t('mailShared.close')}
                </Button>
              </ButtonGroup>
            </section>
          );
        })}
      </div>
    </>
  );
}
