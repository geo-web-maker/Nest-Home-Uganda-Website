import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ButtonGroup } from '../../../components/admin/ButtonGroup';
import { Notice } from '../../../components/admin/Notice';
import { SectionHeader } from '../../../components/admin/SectionHeader';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../../../lib/api/client';
import { CHECK_TONE, type CheckSummary, type SetupCheck } from './settings';
import styles from './MailPage.module.css';

type Run = { checks: SetupCheck[]; summary: CheckSummary };

/** Lets an administrator prove the mail setup works: passive checks, then two real end-to-end tests. */
export function MailSetupCheck() {
  const { t } = useTranslation('admin');
  const [run, setRun] = useState<Run | null>(null);
  const [selfTests, setSelfTests] = useState<Record<string, SetupCheck>>({});
  const [failed, setFailed] = useState(false);

  const check = useMutation({
    mutationFn: () => apiClient.post<Run>('/mail/diagnostics/run', {}),
    onSuccess: (result) => {
      setRun(result);
      setFailed(false);
    },
    onError: () => setFailed(true),
  });
  const selfTest = useMutation({
    mutationFn: (kind: 'loopback' | 'inbound') => apiClient.post<{ check: SetupCheck }>(`/mail/diagnostics/${kind}`, {}),
    onSuccess: (result) => {
      setSelfTests((current) => ({ ...current, [result.check.id]: result.check }));
      setFailed(false);
    },
    onError: () => setFailed(true),
  });

  const rows = [...(run?.checks ?? []), ...Object.values(selfTests)];
  const summary = run?.summary;
  const clean = summary && summary.warn === 0 && summary.fail === 0;

  return (
    <section className={styles.panel} aria-label={t('mailSettings.setupCheck')}>
      <SectionHeader title={t('mailSettings.setupCheck')} />
      <p className={styles.settingHelp}>{t('mailSettings.setupHelp')}</p>
      <ButtonGroup spaced>
        <Button disabled={check.isPending} onClick={() => check.mutate()}>
          {check.isPending ? t('mailSettings.checking') : t('mailSettings.runChecks')}
        </Button>
        <Button variant="outline" disabled={selfTest.isPending} onClick={() => selfTest.mutate('loopback')}>
          {t('mailSettings.testInternal')}
        </Button>
        <Button variant="outline" disabled={selfTest.isPending} onClick={() => selfTest.mutate('inbound')}>
          {t('mailSettings.testInbound')}
        </Button>
      </ButtonGroup>
      <p className={styles.settingHelp}>{t('mailSettings.selfTestHelp')}</p>
      {failed ? <Notice tone="error">{t('mailSettings.checkError')}</Notice> : null}
      {summary ? (
        <Notice tone={summary.fail > 0 ? 'error' : clean ? 'success' : 'info'}>
          {clean ? t('mailSettings.summaryPass') : t('mailSettings.summaryIssues', { pass: summary.pass, warn: summary.warn, fail: summary.fail, skip: summary.skip })}
        </Notice>
      ) : null}
      {rows.length > 0 ? (
        <ul className={styles.checks} aria-label={t('mailSettings.setupCheck')}>
          {rows.map((row) => (
            <li key={row.id} className={styles.checkRow}>
              <Badge tone={CHECK_TONE[row.status]}>{t(`mailSettings.statusLabel.${row.status}`)}</Badge>
              <div>
                <strong>{t(`mailSettings.checks.${row.id}`, { defaultValue: row.id })}</strong>
                <p className={styles.settingHelp}>{row.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
