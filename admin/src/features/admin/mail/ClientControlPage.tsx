import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { LoadingNote } from '../../../components/admin/LoadingNote';
import { useTranslation } from 'react-i18next';
import { ButtonGroup } from '@shared/components/dialogs/ButtonGroup';
import { Notice } from '@shared/components/dialogs/Notice';
import { SectionHeader } from '@shared/components/dialogs/SectionHeader';
import { Button } from '@shared/components/ui/Button';
import { Checkbox } from '@shared/components/ui/Checkbox';
import { Field } from '@shared/components/ui/Field';
import { apiClient } from '@shared/lib/api/client';
import { DataTable, type DataColumn } from '../../../components/admin/DataTable';
import { PageHeader } from '../../../components/admin/PageHeader';
import { ConfirmPopup } from './ConfirmPopup';
import styles from './MailPage.module.css';

export type ClientPolicy = {
  legacy_min_interval_seconds: number;
  min_build: number;
  block_unversioned: boolean;
  blocked_user_ids: string[];
  updated_at: string | null;
  updated_by: string | null;
  current_build: number;
};
type Person = { name: string; email: string } | null;
export type TrafficItem = {
  user_id: string;
  route: string;
  build: number | null;
  user_agent: string;
  ip_hash: string;
  calls: number;
  first_seen: string;
  last_seen: string;
  last_gap_seconds: number | null;
  last_result: 'ok' | 'throttled' | 'upgrade_required' | 'blocked';
  legacy: boolean;
  person: Person;
};
export type Traffic = { current_build: number; since: string; items: TrafficItem[]; blocked: { user_id: string; person: Person }[] };
type Message = { tone: 'success' | 'error'; text: string };
type Pending = { kind: 'risk'; values: PolicyValues } | { kind: 'pause'; userId: string; name: string };
type PolicyValues = { legacy_min_interval_seconds: number; min_build: number; block_unversioned: boolean };

const whole = (text: string): number | null => (/^\d{1,9}$/.test(text.trim()) ? Number(text.trim()) : null);
const when = (iso: string | null) => {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date) : '—';
};

/** Rows for the paused list and the traffic table share one way to name a person. */
export function personLabel(person: Person, fallback: string): string {
  return person ? `${person.name} (${person.email})` : fallback;
}

export function ClientControlPage() {
  const { t } = useTranslation('admin');
  const client = useQueryClient();
  const [intervalText, setIntervalText] = useState('');
  const [minBuild, setMinBuild] = useState('');
  const [blockUnversioned, setBlockUnversioned] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const policy = useQuery({ queryKey: ['mail', 'client-policy'], queryFn: () => apiClient.get<ClientPolicy>('/mail/admin/client-policy'), retry: false });
  const traffic = useQuery({ queryKey: ['mail', 'client-traffic'], queryFn: () => apiClient.get<Traffic>('/mail/admin/client-traffic'), retry: false });

  useEffect(() => {
    if (!policy.data) return;
    setIntervalText(String(policy.data.legacy_min_interval_seconds));
    setMinBuild(String(policy.data.min_build));
    setBlockUnversioned(policy.data.block_unversioned);
  }, [policy.data]);

  const fail = (text: string) => setMessage({ tone: 'error', text });
  const ok = (text: string) => setMessage({ tone: 'success', text });
  const reload = () => Promise.all([client.invalidateQueries({ queryKey: ['mail', 'client-policy'] }), client.invalidateQueries({ queryKey: ['mail', 'client-traffic'] })]);

  const save = useMutation({
    mutationFn: (body: Partial<PolicyValues> & { blocked_user_ids?: string[] }) => apiClient.put<ClientPolicy>('/mail/admin/client-policy', body),
    onError: () => fail(t('clientControl.saveError')),
  });

  const current = policy.data?.current_build ?? traffic.data?.current_build ?? 1;
  const blocked = policy.data?.blocked_user_ids ?? [];
  const names = new Map<string, Person>();
  for (const item of traffic.data?.items ?? []) names.set(item.user_id, item.person);
  for (const item of traffic.data?.blocked ?? []) names.set(item.user_id, item.person);
  const nameOf = (userId: string) => personLabel(names.get(userId) ?? null, `${t('clientControl.unknownPerson')} (${userId})`);

  const submitRules = () => {
    const seconds = whole(intervalText);
    const build = whole(minBuild);
    if (seconds === null || build === null || seconds > 86_400) return fail(t('clientControl.saveError'));
    const values: PolicyValues = { legacy_min_interval_seconds: seconds, min_build: build, block_unversioned: blockUnversioned };
    const turnsOnLockout = (values.block_unversioned && !policy.data?.block_unversioned) || (values.min_build > current && values.min_build !== policy.data?.min_build);
    if (turnsOnLockout) return setPending({ kind: 'risk', values });
    void commitRules(values);
  };

  const commitRules = async (values: PolicyValues) => {
    setPending(null);
    try {
      await save.mutateAsync(values);
      ok(t('clientControl.saved'));
      await reload();
    } catch {
      /* onError already showed the message */
    }
  };

  const changePaused = async (next: string[], done: string) => {
    setPending(null);
    try {
      await save.mutateAsync({ blocked_user_ids: next });
      ok(done);
      await reload();
    } catch {
      /* onError already showed the message */
    }
  };

  const columns: DataColumn<TrafficItem>[] = [
    { key: 'person', header: t('clientControl.person'), cell: (row) => personLabel(row.person, `${t('clientControl.unknownPerson')} (${row.user_id})`) },
    {
      key: 'build',
      header: t('clientControl.build'),
      cell: (row) => `${row.build === null ? t('clientControl.unversioned') : row.build} · ${row.legacy ? t('clientControl.oldBuild') : t('clientControl.currentBuild')}`,
    },
    { key: 'route', header: t('clientControl.route'), cell: (row) => row.route },
    { key: 'calls', header: t('clientControl.calls'), cell: (row) => String(row.calls) },
    { key: 'gap', header: t('clientControl.gap'), cell: (row) => (row.last_gap_seconds === null ? '—' : t('clientControl.gapSeconds', { seconds: Math.round(row.last_gap_seconds) })) },
    { key: 'last', header: t('clientControl.lastSeen'), cell: (row) => when(row.last_seen) },
    { key: 'result', header: t('clientControl.result'), cell: (row) => t(`clientControl.results.${row.last_result}`) },
    { key: 'device', header: t('clientControl.device'), cell: (row) => `${row.user_agent || '—'} · ${row.ip_hash}` },
    {
      key: 'action',
      header: '',
      cell: (row) => {
        const label = personLabel(row.person, row.user_id);
        return blocked.includes(row.user_id) ? null : (
          <Button variant="outline" aria-label={t('clientControl.pauseFor', { name: label })} onClick={() => setPending({ kind: 'pause', userId: row.user_id, name: label })}>
            {t('clientControl.pause')}
          </Button>
        );
      },
    },
  ];

  return (
    <section aria-label={t('clientControl.title')}>
      <PageHeader
        title={t('clientControl.title')}
        subtitle={t('clientControl.intro')}
        actions={<Button variant="outline" loading={policy.isFetching || traffic.isFetching} onClick={() => void reload()}>{t('clientControl.refresh')}</Button>}
      />
      {policy.isError || traffic.isError ? <Notice tone="error">{t('clientControl.loadError')}</Notice> : null}
      {message ? <Notice tone={message.tone} floating onDismiss={() => setMessage(null)}>{message.text}</Notice> : null}

      <div className={styles.settingsStack}>
        <section className={styles.panel} aria-label={t('clientControl.policyTitle')}>
          <SectionHeader title={t('clientControl.policyTitle')} />
          {policy.data ? <>
            <div className={styles.settingRow}>
              <Field type="number" min={0} max={86_400} label={t('clientControl.intervalLabel')} value={intervalText} onChange={(event) => setIntervalText(event.target.value)} />
              <p className={styles.settingHelp}>{t('clientControl.intervalHelp')}</p>
            </div>
            <div className={styles.settingRow}>
              <Field type="number" min={0} label={t('clientControl.minBuildLabel')} value={minBuild} onChange={(event) => setMinBuild(event.target.value)} />
              <p className={styles.settingHelp}>{t('clientControl.minBuildHelp', { build: current })}</p>
            </div>
            <div className={styles.settingRow}>
              <Checkbox label={t('clientControl.blockUnversionedLabel')} checked={blockUnversioned} onChange={(event) => setBlockUnversioned(event.target.checked)} />
              <p className={styles.settingHelp}>{t('clientControl.blockUnversionedHelp')}</p>
            </div>
          </>
          : policy.isError ? null : <LoadingNote>{t('clientControl.loadingRules', 'Loading the current rules…')}</LoadingNote>}
          <ButtonGroup size="compact">
            <Button disabled={save.isPending || !policy.data} onClick={submitRules}>{save.isPending ? t('clientControl.saving') : t('clientControl.save')}</Button>
          </ButtonGroup>
          {policy.data?.updated_at ? <p className={styles.settingHelp}>{t('clientControl.updatedBy', { when: when(policy.data.updated_at) })}</p> : null}
        </section>

        <section className={styles.panel} aria-label={t('clientControl.pausedTitle')}>
          <SectionHeader title={t('clientControl.pausedTitle')} />
          <p className={styles.settingHelp}>{t('clientControl.pausedIntro')}</p>
          {blocked.length === 0 ? <p>{t('clientControl.pausedEmpty')}</p> : (
            <ul>
              {blocked.map((userId) => (
                <li key={userId} className={styles.settingRow}>
                  <span>{nameOf(userId)}</span>
                  <Button
                    variant="outline"
                    disabled={save.isPending}
                    aria-label={t('clientControl.resumeFor', { name: nameOf(userId) })}
                    onClick={() => void changePaused(blocked.filter((id) => id !== userId), t('clientControl.resumed', { name: nameOf(userId) }))}
                  >
                    {t('clientControl.resume')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.panel} aria-label={t('clientControl.trafficTitle')}>
          <SectionHeader title={t('clientControl.trafficTitle')} />
          <p className={styles.settingHelp}>{t('clientControl.trafficIntro', { since: when(traffic.data?.since ?? null) })}</p>
          <DataTable
            columns={columns}
            rows={traffic.data?.items ?? []}
            getRowKey={(row) => `${row.user_id}|${row.route}|${row.build}|${row.user_agent}|${row.ip_hash}`}
            loading={traffic.isPending}
            labels={{ caption: t('clientControl.trafficCaption'), loading: t('clientControl.trafficLoading'), empty: t('clientControl.trafficEmpty') }}
          />
        </section>
      </div>

      {pending?.kind === 'risk' ? (
        <ConfirmPopup labelledBy="client-risk-title" onDismiss={() => setPending(null)}>
          <h2 id="client-risk-title">{t('clientControl.riskTitle')}</h2>
          <p>{t('clientControl.riskBody')}</p>
          <ButtonGroup>
            <Button variant="outline" onClick={() => setPending(null)}>{t('clientControl.cancel')}</Button>
            <Button variant="danger" onClick={() => void commitRules(pending.values)}>{t('clientControl.riskConfirm')}</Button>
          </ButtonGroup>
        </ConfirmPopup>
      ) : null}
      {pending?.kind === 'pause' ? (
        <ConfirmPopup labelledBy="client-pause-title" onDismiss={() => setPending(null)}>
          <h2 id="client-pause-title">{t('clientControl.pauseConfirmTitle', { name: pending.name })}</h2>
          <p>{t('clientControl.pauseConfirmBody')}</p>
          <ButtonGroup>
            <Button variant="outline" onClick={() => setPending(null)}>{t('clientControl.cancel')}</Button>
            <Button variant="danger" onClick={() => void changePaused([...blocked, pending.userId], t('clientControl.paused', { name: pending.name }))}>{t('clientControl.pauseConfirm')}</Button>
          </ButtonGroup>
        </ConfirmPopup>
      ) : null}
    </section>
  );
}
