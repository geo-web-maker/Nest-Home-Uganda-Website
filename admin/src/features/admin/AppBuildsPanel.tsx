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

const TARGET_LABELS: Record<BuildTarget, string> = {
  'nurse-apk': 'Nurse Android app (full APK)',
  'admin-apk': 'Admin Android app (full APK)',
  'nurse-web': 'Nurse web update (no reinstall)',
  'admin-web': 'Admin web update (no reinstall)',
};
const STATE_LABELS: Record<BuildState, string> = {
  queued: '⏳ Waiting to start',
  running: '🔄 Building',
  succeeded: '✅ Published',
  failed: '❌ Failed',
  cancelled: '⛔ Cancelled',
};
const ACTIVE: BuildState[] = ['queued', 'running'];
const SEMVER = /^\d+\.\d+\.\d+$/;
const POLL_MS = 8000;

const timeLabel = (value: string | null) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : '—';
};

export function AppBuildsPanel() {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<BuildTarget>('nurse-apk');
  const [version, setVersion] = useState('');
  const [formError, setFormError] = useState('');
  const builds = useQuery({
    queryKey: ['admin', 'app-builds'],
    queryFn: () => apiClient.get<BuildsResponse>('/admin/app-releases/builds'),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.items.some((run) => ACTIVE.includes(run.state)) ? POLL_MS : false,
  });
  const start = useMutation({
    mutationFn: () =>
      apiClient.post<{ tag: string }>('/admin/app-releases/builds', { target, version: version.trim() }),
    onSuccess: () => {
      setFormError('');
      setVersion('');
      const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'app-builds'] });
        void queryClient.invalidateQueries({ queryKey: ['admin', 'app-releases'] });
      };
      refresh();
      // GitHub needs a moment to register the run after the tag is created.
      window.setTimeout(refresh, 2500);
    },
    onError: (error) =>
      setFormError(error instanceof Error ? error.message : 'The build could not be started.'),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    if (!SEMVER.test(version.trim())) {
      setFormError('Enter the version as three numbers, for example 1.0.0.');
      return;
    }
    start.mutate();
  };
  const tag = start.data?.tag;
  const anyActive = builds.data?.items.some((run) => ACTIVE.includes(run.state)) ?? false;
  return (
    <>
      <form className={styles.card} onSubmit={submit} aria-label="Start a build">
        <h2>Build and publish an app</h2>
        <p>
          This tags the latest code on GitHub. GitHub then builds, signs and publishes the app, which takes about
          3 minutes for a web update and 10 to 15 for a full APK. The version must match the one in the app’s
          package.json on GitHub, so change it there first.
        </p>
        <div className={styles.formGrid}>
          <Field
            kind="select"
            label="What to build"
            value={target}
            onChange={(e) => setTarget(e.target.value as BuildTarget)}
          >
            {(Object.keys(TARGET_LABELS) as BuildTarget[]).map((key) => (
              <option key={key} value={key}>{TARGET_LABELS[key]}</option>
            ))}
          </Field>
          <Field
            label="Version"
            value={version}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setVersion(e.target.value)}
            placeholder="1.0.0"
            required
            requiredLabel="(required)"
          />
        </div>
        {formError ? <p role="alert">{formError}</p> : null}
        {tag ? <p role="status">Build started for {tag}. Progress appears below.</p> : null}
        <Button type="submit" disabled={start.isPending}>{start.isPending ? 'Starting…' : 'Start build'}</Button>
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
            <p role="status">
              {anyActive ? 'A build is in progress. This list refreshes by itself.' : `Repository: ${builds.data.repo}`}
            </p>
            <DataTable
              columns={[
                { key: 'tag', header: 'Build', cell: (run: BuildRun) => run.tag },
                { key: 'state', header: 'Status', cell: (run: BuildRun) => STATE_LABELS[run.state] },
                { key: 'started', header: 'Started', cell: (run: BuildRun) => timeLabel(run.created_at) },
                {
                  key: 'log',
                  header: 'Log',
                  cell: (run: BuildRun) =>
                    run.url ? (
                      <a href={run.url} target="_blank" rel="noreferrer">Open on GitHub</a>
                    ) : '—',
                },
              ]}
              rows={builds.data.items}
              getRowKey={(run: BuildRun) => String(run.id)}
              labels={{ caption: 'Recent app builds', loading: 'Loading…', empty: 'Nothing to show.' }}
            />
            <Button variant="outline" onClick={() => void builds.refetch()} disabled={builds.isFetching}>
              {builds.isFetching ? 'Refreshing…' : 'Refresh'}
            </Button>
          </>
        ) : null}
      </div>
    </>
  );
}
