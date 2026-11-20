import { useState } from 'react';
import { Notice } from '@shared/components/dialogs/Notice';
import { SectionHeader } from '@shared/components/dialogs/SectionHeader';
import { Badge } from '@shared/components/ui/Badge';
import { Button } from '@shared/components/ui/Button';
import { apiClient } from '@shared/lib/api/client';
import styles from '../agreements/AgreementDiagnostics.module.css';

type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip';
export type ReleaseCheck = { id: string; status: CheckStatus; detail: string };
type Summary = Record<CheckStatus, number>;
type Run = { checks: ReleaseCheck[]; summary: Summary };

const tone: Record<CheckStatus, 'default' | 'new' | 'red' | 'muted'> = {
  pass: 'default', warn: 'new', fail: 'red', skip: 'muted',
};
const statusWord: Record<CheckStatus, string> = { pass: 'OK', warn: 'CHECK', fail: 'FIX', skip: 'SKIPPED' };

/** Preflight for app releases: run it before starting a build so a bad setting fails here, not 15 minutes in. */
export function ReleaseChecksSection() {
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      setRun(await apiClient.post<Run>('/admin/app-releases/preflight', {}));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The release checks could not be run.');
    } finally {
      setBusy(false);
    }
  };

  const blocked = run ? run.summary.fail > 0 : false;
  return (
    <section aria-labelledby="release-checks-heading">
      <SectionHeader
        title="Release checks"
        note="Run before every build. Checks the release key, storage, GitHub access, workflows, versions, secret names and variable formats."
      />
      <p>
        This writes and removes one tiny test file in the private bucket and one throwaway tag on GitHub. It never
        shows secret values, and it cannot read the values of GitHub secrets, so a mistyped secret can still only be
        caught by the build itself.
      </p>
      {error ? <Notice tone="error"><p>{error}</p></Notice> : null}
      <Button onClick={() => void start()} disabled={busy}>{busy ? 'Checking…' : 'Run release checks'}</Button>
      {run ? (
        <>
          <Notice tone={blocked ? 'error' : run.summary.warn > 0 ? 'info' : 'success'}>
            {blocked
              ? `Not ready: ${run.summary.fail} to fix first. Fix them, then run the checks again.`
              : run.summary.warn > 0
                ? `Ready, with ${run.summary.warn} thing${run.summary.warn === 1 ? '' : 's'} to look at.`
                : 'Ready to build. All checks passed.'}
            {' '}({run.summary.pass} OK · {run.summary.warn} check · {run.summary.fail} fix · {run.summary.skip} skipped)
          </Notice>
          <ul className={styles.checks}>
            {run.checks.map((item) => (
              <li className={styles.checkItem} key={item.id}>
                <Badge tone={tone[item.status]}>{statusWord[item.status]}</Badge>
                <div><strong>{item.id.replaceAll('_', ' ')}</strong><p>{item.detail}</p></div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
