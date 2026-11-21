import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Button } from '@shared/components/ui/Button';
import { Field } from '@shared/components/ui/Field';
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
const SEMVER = /^\d+\.\d+\.\d+$/;

type AppKey = 'nurse' | 'admin';
type Kind = 'none' | 'web' | 'apk';
type Versions = { apps: Record<AppKey, { current: string; next: { apk: string; web_patch: string; web_minor: string } | null }> };
type BatchResult = { items: { target: BuildTarget; tag: string; version: string; ok: boolean; error: string | null }[] };
type Choice = { kind: Kind; version: string };

const APP_LABELS: Record<AppKey, string> = { nurse: 'Nurse app', admin: 'Admin app' };
const KIND_LABELS: Record<Kind, string> = { none: 'Skip', web: 'Web update', apk: 'Android app' };
const KIND_HINT: Record<Exclude<Kind, 'none'>, string> = {
  web: 'No reinstall. Changes the inner numbers (1.0.0 to 1.0.1 or 1.1.0). About 3 minutes.',
  apk: 'Full install. Always the next major version (1.4.2 to 2.0.0) and includes the latest screens. About 10 to 15 minutes.',
};

const parts = (v: string): [number, number, number] => {
  const [major = 0, minor = 0, patch = 0] = v.split('.').map(Number);
  return [major, minor, patch];
};
const cmp = (a: string, b: string) => {
  const [x, y] = [parts(a), parts(b)];
  return x[0] !== y[0] ? Math.sign(x[0] - y[0]) : x[1] !== y[1] ? Math.sign(x[1] - y[1]) : Math.sign(x[2] - y[2]);
};

/** Mirrors the server rule so mistakes show before anything is sent; the server still decides. */
export function versionProblem(kind: Kind, current: string, version: string): string {
  if (kind === 'none') return '';
  if (!SEMVER.test(version)) return 'Enter the version as three numbers, for example 1.0.0.';
  const [cur, req] = [parts(current), parts(version)];
  if (cmp(version, current) < 0) return `${version} is lower than the current version ${current}.`;
  if (kind === 'apk') {
    if (cmp(version, current) === 0) return '';
    if (req[0] !== cur[0] + 1 || req[1] !== 0 || req[2] !== 0) return `A new Android app must be the next major version, ${cur[0] + 1}.0.0.`;
    return '';
  }
  if (req[0] !== cur[0]) return `A web update keeps the first number (${cur[0]}). A new first number needs a new Android app.`;
  if (cmp(version, current) === 0) return `${version} is already the current version.`;
  return '';
}

const timeLabel = (value: string | null) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : '—';
};

export function AppBuildsPanel() {
  const queryClient = useQueryClient();
  const [choices, setChoices] = useState<Record<AppKey, Choice>>({ nurse: { kind: 'none', version: '' }, admin: { kind: 'none', version: '' } });
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
    const next = versions.data?.apps[app].next;
    setFormError('');
    setChoices((all) => ({ ...all, [app]: { kind, version: kind === 'none' || !next ? '' : kind === 'apk' ? next.apk : next.web_patch } }));
  };
  const setVersion = (app: AppKey, version: string) => setChoices((all) => ({ ...all, [app]: { ...all[app], version } }));
  const both = (kind: Kind) => (['nurse', 'admin'] as AppKey[]).forEach((app) => choose(app, kind));

  const selected = (Object.keys(choices) as AppKey[]).filter((app) => choices[app].kind !== 'none');
  const problems = Object.fromEntries(selected.map((app) => [app, versionProblem(choices[app].kind, versions.data?.apps[app].current ?? '0.0.0', choices[app].version.trim())])) as Record<string, string>;
  const blocked = selected.some((app) => problems[app]);

  const start = useMutation({
    mutationFn: () => apiClient.post<BatchResult>('/admin/app-releases/builds/batch', {
      items: selected.map((app) => ({ target: `${app}-${choices[app].kind}` as BuildTarget, version: choices[app].version.trim() })),
    }),
    onSuccess: (result) => {
      setFormError('');
      setOutcome(result.items);
      setChoices({ nurse: { kind: 'none', version: '' }, admin: { kind: 'none', version: '' } });
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
    if (blocked) { setFormError('Fix the version problems shown first.'); return; }
    start.mutate();
  };
  const anyActive = builds.data?.items.some((run) => ACTIVE.includes(run.state)) ?? false;

  return (
    <>
      <form className={styles.card} onSubmit={submit} aria-label="Start builds">
        <h2>Build and publish</h2>
        <p>
          Pick what to build for each app. Starting writes the new version into the app’s package.json on GitHub,
          then GitHub builds, signs and publishes. Versions can never go down.
        </p>
        {versions.isError ? <p role="alert">{versions.error instanceof Error ? versions.error.message : 'Current versions could not be loaded.'}</p> : null}
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
              <legend>{APP_LABELS[app]}{info ? ` · now ${info.current}` : ''}</legend>
              <div role="radiogroup" aria-label={`${APP_LABELS[app]} build type`}>
                {(Object.keys(KIND_LABELS) as Kind[]).map((kind) => (
                  <label key={kind} style={{ marginRight: 16 }}>
                    <input type="radio" name={`kind-${app}`} checked={choice.kind === kind} onChange={() => choose(app, kind)} disabled={!info} /> {KIND_LABELS[kind]}
                  </label>
                ))}
              </div>
              {choice.kind !== 'none' ? (
                <>
                  <p>{KIND_HINT[choice.kind]}</p>
                  <Field
                    label={`${APP_LABELS[app]} version`}
                    value={choice.version}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setVersion(app, e.target.value)}
                    placeholder="1.0.0"
                    required
                    requiredLabel="(required)"
                  />
                  {choice.kind === 'web' && info?.next ? (
                    <p>
                      <Button type="button" variant="outline" onClick={() => setVersion(app, info.next!.web_patch)}>{info.next.web_patch} (fix)</Button>{' '}
                      <Button type="button" variant="outline" onClick={() => setVersion(app, info.next!.web_minor)}>{info.next.web_minor} (new feature)</Button>
                    </p>
                  ) : null}
                  {problems[app] ? <p role="alert">{problems[app]}</p> : null}
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
