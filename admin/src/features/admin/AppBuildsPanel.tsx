import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@shared/components/ui/Button';
import { apiClient } from '@shared/lib/api/client';
import { DataTable } from '../../components/admin/DataTable';
import styles from './GovernancePages.module.css';

export type BuildTarget = 'nurse-apk' | 'admin-apk' | 'nurse-web' | 'admin-web';
export type BuildState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type BuildRun = {
  id: number;
  run_number: number | null;
  tag: string;
  name: string;
  state: BuildState;
  created_at: string | null;
  updated_at: string | null;
  url: string | null;
};
type BuildsResponse = { repo: string; items: BuildRun[] };

const STATE_LABELS: Record<BuildState, string> = {
  queued: '⏳ Waiting to start',
  running: '🔄 Building',
  succeeded: '✅ Published',
  failed: '❌ Failed',
  cancelled: '⛔ Cancelled',
};
const ACTIVE: BuildState[] = ['queued', 'running'];
const POLL_MS = 8000;

type AppKey = 'nurse' | 'admin';
type Kind = 'none' | 'web' | 'apk';
type Versions = { apps: Record<AppKey, { current: string; current_apk: string | null; current_web: string | null; next: { apk: string; web: string | null } }> };
type BatchResult = { items: { target: BuildTarget; tag: string; version: string; ok: boolean; error: string | null }[] };
type Choice = { kind: Kind };

const APP_LABELS: Record<AppKey, string> = { nurse: 'Nurse app', admin: 'Admin app' };
const KIND_LABELS: Record<Kind, string> = { none: 'Skip', web: 'Web update', apk: 'Android app' };
const KIND_HINT: Record<Exclude<Kind, 'none'>, string> = {
  web: 'No reinstall. Takes the next small number (1.0.7 to 1.0.8, counting up to 99.99). About 3 minutes.',
  apk: 'Full install. Takes the next whole number (1.0.0 to 2.0.0), includes the latest screens and starts the small numbers again at 0.0. About 10 to 15 minutes.',
};
const NO_CHOICE: Record<AppKey, Choice> = { nurse: { kind: 'none' }, admin: { kind: 'none' } };

/** The number a build of this kind will get, as worked out by the server (null when unknown or full). */
export function plannedVersion(kind: Kind, info: Versions['apps'][AppKey] | undefined): string | null {
  if (kind === 'none' || !info) return null;
  return kind === 'apk' ? info.next.apk : info.next.web;
}

const timeLabel = (value: string | null) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : '—';
};

export function AppBuildsPanel() {
  const queryClient = useQueryClient();
  const [choices, setChoices] = useState<Record<AppKey, Choice>>(NO_CHOICE);
  const [formError, setFormError] = useState('');
  const [outcome, setOutcome] = useState<BatchResult['items']>([]);
  const builds = useQuery({
    queryKey: ['admin', 'app-builds'],
    queryFn: () => apiClient.get<BuildsResponse>('/admin/app-releases/builds'),
    retry: false,
    refetchInterval: (query) => (query.state.data?.items.some((run) => ACTIVE.includes(run.state)) ? POLL_MS : false),
  });
  const versions = useQuery({
    queryKey: ['admin', 'app-build-versions'],
    queryFn: () => apiClient.get<Versions>('/admin/app-releases/builds/versions'),
    retry: false,
  });

  const choose = (app: AppKey, kind: Kind) => {
    setFormError('');
    setChoices((all) => ({ ...all, [app]: { kind } }));
  };
  const both = (kind: Kind) => (['nurse', 'admin'] as AppKey[]).forEach((app) => choose(app, kind));

  const selected = (Object.keys(choices) as AppKey[]).filter((app) => choices[app].kind !== 'none');
  const planned = (app: AppKey) => plannedVersion(choices[app].kind, versions.data?.apps[app]);
  // Only a full counter blocks: when the numbers could not be loaded the server still decides.
  const full = (app: AppKey) => choices[app].kind === 'web' && Boolean(versions.data) && !planned(app);
  const blocked = selected.some((app) => full(app));

  const start = useMutation({
    mutationFn: () => apiClient.post<BatchResult>('/admin/app-releases/builds/batch', {
      items: selected.map((app) => ({ target: `${app}-${choices[app].kind}` as BuildTarget, version: planned(app) ?? '' })),
    }),
    onSuccess: (result) => {
      setFormError('');
      setOutcome(result.items);
      setChoices(NO_CHOICE);
      const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'app-builds'] });
        void queryClient.invalidateQueries({ queryKey: ['admin', 'app-releases'] });
        void queryClient.invalidateQueries({ queryKey: ['admin', 'app-build-versions'] });
      };
      refresh();
      // GitHub needs a moment to register the runs after the tags are created.
      window.setTimeout(refresh, 2500);
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : 'The builds could not be started.'),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setOutcome([]);
    if (selected.length === 0) { setFormError('Choose at least one build.'); return; }
    if (blocked) { setFormError('Build a new Android app first: the web counter is full.'); return; }
    start.mutate();
  };
  const anyActive = builds.data?.items.some((run) => ACTIVE.includes(run.state)) ?? false;

  return (
    <>
      <form className={styles.card} onSubmit={submit} aria-label="Start builds">
        <h2>Build and publish</h2>
        <p>
          Pick what to build for each app. The version number is given automatically: an Android app takes the next
          whole number, a web update the next small number. Web updates are also published by themselves every time
          the site code is pushed. A build that fails does not use its number up.
        </p>
        {versions.isError ? <p role="alert">Current versions could not be loaded ({versions.error instanceof Error ? versions.error.message : 'unknown error'}). You can still choose a build; the server works out the number.</p> : null}
        <div className={styles.formGrid}>
          <Button type="button" variant="outline" onClick={() => both('web')}>Web update for both</Button>
          <Button type="button" variant="outline" onClick={() => both('apk')}>Android app for both</Button>
          <Button type="button" variant="outline" onClick={() => both('none')}>Clear</Button>
        </div>
        {(Object.keys(APP_LABELS) as AppKey[]).map((app) => {
          const info = versions.data?.apps[app];
          const choice = choices[app];
          return (
            <fieldset key={app} className={styles.card}>
              <legend>{APP_LABELS[app]}{info ? ` · app ${info.current_apk ?? 'not released yet'} · web ${info.current_web ?? info.current_apk ?? '—'}` : ''}</legend>
              <div role="radiogroup" aria-label={`${APP_LABELS[app]} build type`} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(Object.keys(KIND_LABELS) as Kind[]).map((kind) => (
                  <label key={kind} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 16, whiteSpace: 'nowrap' }}>
                    <input type="radio" name={`kind-${app}`} checked={choice.kind === kind} onChange={() => choose(app, kind)} /> {KIND_LABELS[kind]}
                  </label>
                ))}
              </div>
              {choice.kind !== 'none' ? (
                <>
                  <p>{KIND_HINT[choice.kind]}</p>
                  {planned(app) ? <p role="status">This build will be <strong>{planned(app)}</strong>.</p> : null}
                  {full(app) ? <p role="alert">The web counter is full (99.99). Build a new Android app to start it again.</p> : null}
                </>
              ) : null}
            </fieldset>
          );
        })}
        {formError ? <p role="alert">{formError}</p> : null}
        {outcome.map((item) => (
          <p key={item.target} role={item.ok ? 'status' : 'alert'}>
            {item.ok ? `Build started for ${item.tag}. Progress appears below.` : `${item.tag} could not start: ${item.error}`}
          </p>
        ))}
        <Button type="submit" disabled={start.isPending || selected.length === 0 || blocked}>
          {start.isPending ? 'Starting…' : selected.length > 1 ? `Start ${selected.length} builds` : 'Start build'}
        </Button>
      </form>
      <div className={styles.card}>
        <h2>Recent builds</h2>
        {builds.isPending ? <p role="status">Loading builds…</p> : null}
        {builds.isError ? (
          <div role="alert">
            <p>{builds.error instanceof Error ? builds.error.message : 'Builds could not be loaded.'}</p>
            <Button variant="outline" onClick={() => void builds.refetch()}>Retry</Button>
          </div>
        ) : null}
        {builds.data && builds.data.items.length === 0 ? <p>No builds yet. Start one above.</p> : null}
        {builds.data && builds.data.items.length > 0 ? (
          <>
            <p role="status">{anyActive ? 'A build is in progress. This list refreshes by itself.' : `Repository: ${builds.data.repo}`}</p>
            <DataTable
              columns={[
                { key: 'tag', header: 'Build', cell: (run: BuildRun) => run.tag },
                { key: 'state', header: 'Status', cell: (run: BuildRun) => STATE_LABELS[run.state] },
                { key: 'started', header: 'Started', cell: (run: BuildRun) => timeLabel(run.created_at) },
                { key: 'log', header: 'Log', cell: (run: BuildRun) => (run.url ? <a href={run.url} target="_blank" rel="noreferrer">Open on GitHub</a> : '—') },
              ]}
              rows={builds.data.items}
              getRowKey={(run: BuildRun) => String(run.id)}
              labels={{ caption: 'Recent app builds', loading: 'Loading…', empty: 'Nothing to show.' }}
            />
            <Button variant="outline" onClick={() => void builds.refetch()} disabled={builds.isFetching}>{builds.isFetching ? 'Refreshing…' : 'Refresh'}</Button>
          </>
        ) : null}
      </div>
    </>
  );
}
