import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ButtonGroup } from '../../../components/admin/ButtonGroup';
import { Notice } from '../../../components/admin/Notice';
import { PageHeader } from '../../../components/admin/PageHeader';
import { SectionHeader } from '../../../components/admin/SectionHeader';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { apiClient } from '../../../lib/api/client';
import type { AdminUserPage } from '../users/types';
import styles from './MailPage.module.css';

export type SharedRole = 'owner' | 'send_as' | 'read_only';
export type SharedMember = { user_id: string; role: SharedRole };
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
    queryFn: () => apiClient.get<{ items: SharedMailbox[] }>('/mail/shared'),
    retry: false,
  });
  const users = useQuery({
    queryKey: ['mail', 'shared', 'users'],
    queryFn: () => apiClient.get<AdminUserPage>('/admin/users', { params: { page: 1, page_size: 100 } }),
    retry: false,
  });
  const people = users.data?.items ?? [];
  const nameOf = (id: string) => {
    const person = people.find((user) => user.id === id);
    return person ? `${person.name} (${person.email})` : id;
  };

  const fail = (text: string) => setMessage({ tone: 'error', text });
  const ok = (text: string) => setMessage({ tone: 'success', text });
  const reload = () => client.invalidateQueries({ queryKey: ['mail', 'shared'] });

  const verify = useMutation({
    mutationFn: () => apiClient.post('/mail/totp/verify', { code: totpCode }),
    onSuccess: async () => {
      setTotpCode('');
      ok(t('mailShared.verified'));
      await reload();
    },
    onError: () => fail(t('mailShared.verifyError')),
  });
  const create = useMutation({
    mutationFn: () => apiClient.post('/mail/shared', { local_part: localPart.trim().toLowerCase(), display_name: displayName.trim() }),
    onSuccess: async () => {
      setLocalPart('');
      setDisplayName('');
      ok(t('mailShared.created'));
      await reload();
    },
    onError: () => fail(t('mailShared.createError')),
  });
  const assign = useMutation({
    mutationFn: (input: { mailboxId: string; userId: string; role: SharedRole }) =>
      apiClient.put(`/mail/shared/${input.mailboxId}/members/${input.userId}`, { role: input.role }),
    onSuccess: async () => {
      ok(t('mailShared.assigned'));
      await reload();
    },
    onError: () => fail(t('mailShared.assignError')),
  });
  const unassign = useMutation({
    mutationFn: (input: { mailboxId: string; userId: string }) => apiClient.delete(`/mail/shared/${input.mailboxId}/members/${input.userId}`),
    onSuccess: async () => {
      ok(t('mailShared.removed'));
      await reload();
    },
    onError: () => fail(t('mailShared.assignError')),
  });
  const close = useMutation({
    mutationFn: (mailboxId: string) => apiClient.post(`/mail/shared/${mailboxId}/close`, {}),
    onSuccess: async () => {
      ok(t('mailShared.closed'));
      await reload();
    },
    onError: () => fail(t('mailShared.assignError')),
  });

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
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
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
                    {nameOf(member.user_id)} · {t(`mailShared.role.${member.role}`)}{' '}
                    <Button
                      variant="outline"
                      size="compact"
                      onClick={() => unassign.mutate({ mailboxId: box.id, userId: member.user_id })}
                      aria-label={`${t('mailShared.remove')}: ${nameOf(member.user_id)} (${box.address})`}
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
                  disabled={!chosen.user || assign.isPending}
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
