import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Notice } from '@shared/components/dialogs/Notice';
import { SectionHeader } from '@shared/components/dialogs/SectionHeader';
import { Button } from '@shared/components/ui/Button';
import { apiClient } from '@shared/lib/api/client';
import { dialogs } from '@shared/lib/dialogs';

type Sms = { provider: string; test_number: string };

/** SMS tests, moved here from SMS settings. The test number itself is still set in SMS settings. */
export function SmsDiagnosticsSection() {
  const sms = useQuery({ queryKey: ['admin', 'sms-settings'], queryFn: () => apiClient.get<Sms>('/admin/care/sms/settings'), retry: false });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const live = sms.data?.provider === 'mambosms';
  const number = sms.data?.test_number ?? '';

  async function run(kind: 'test' | 'balance') {
    const ask = kind === 'test'
      ? (live ? `Send a real test SMS to ${number} using MamboSMS? This does not create an SOS case.` : 'Run the test-message path with the console provider? No handset SMS is sent. This does not create an SOS case.')
      : 'Query the MamboSMS account balance now? This contacts the provider and does not send an SMS.';
    if (!(await dialogs.confirm(ask))) return;
    setBusy(kind); setError(''); setNotice('');
    try {
      if (kind === 'test') {
        await apiClient.post('/admin/care/sos/test-sms', {});
        setNotice(live ? 'Test request accepted by the provider. Check the notification log; handset delivery is not confirmed.' : 'Console dry-run completed; no real SMS was sent.');
      } else {
        const result = await apiClient.post<{ balance: number }>('/admin/care/sms/balance', {});
        setBalance(Number(result.balance));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The SMS check could not be completed.');
    } finally { setBusy(''); }
  }

  return (
    <section aria-labelledby="sms-diagnostics-heading">
      <SectionHeader title="SMS diagnostics" />
      {sms.isError ? <Notice tone="error"><p>Could not load SMS settings.</p></Notice> : null}
      {error ? <Notice tone="error"><p>{error}</p></Notice> : null}
      {notice ? <Notice tone="info"><p>{notice}</p></Notice> : null}
      <p>Provider: <strong>{live ? 'MamboSMS' : 'Console (dry run)'}</strong> · Test destination: <strong>{number || 'not set'}</strong></p>
      <Button variant="outline" disabled={!number || busy !== ''} onClick={() => void run('test')}>{busy === 'test' ? 'Testing…' : 'Send test message'}</Button>{' '}
      {live ? <Button variant="outline" disabled={busy !== ''} onClick={() => void run('balance')}>{busy === 'balance' ? 'Checking…' : 'Check provider balance'}</Button> : null}
      {balance !== null ? <Notice tone="info"><p>Provider-reported balance: <strong>{balance}</strong> (units not inferred).</p></Notice> : null}
    </section>
  );
}
