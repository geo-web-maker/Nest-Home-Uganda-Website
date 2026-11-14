import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Notice } from '@shared/components/dialogs/Notice';
import { SectionHeader } from '@shared/components/dialogs/SectionHeader';
import { Button } from '@shared/components/ui/Button';
import { Field } from '@shared/components/ui/Field';
import { apiClient } from '@shared/lib/api/client';
import { requestTotp } from '@shared/lib/totpPrompt';

type Status = { enabled: boolean; verified: boolean };

/**
 * The authenticator lives here. Setup and every code check happen in the pop-up that opens whenever
 * a protected action is clicked anywhere in the admin. This section shows the state, lets you open the
 * pop-up on purpose, and resets the authenticator (which needs a current code).
 */
export function AuthenticatorSection() {
  const client = useQueryClient();
  const key = ['mail', 'totp-status'];
  const status = useQuery({ queryKey: key, queryFn: () => apiClient.get<Status>('/mail/totp/status'), retry: false });
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const reset = useMutation({
    mutationFn: () => apiClient.post('/mail/totp/reset', { code: code.trim() }),
    onSuccess: () => { setCode(''); setMessage('Authenticator removed. The next protected action walks you through setting it up again.'); void refresh(); },
  });
  const state = status.data;

  async function openPrompt() {
    setMessage('');
    if (await requestTotp()) { setMessage('Authenticator verified for this device.'); void refresh(); }
  }

  return (
    <section aria-labelledby="authenticator-heading">
      <SectionHeader title="Authenticator" />
      {message ? <Notice tone="info"><p>{message}</p></Notice> : null}
      {reset.isError ? <Notice tone="error"><p>{reset.error instanceof Error ? reset.error.message : 'The authenticator could not be reset.'}</p></Notice> : null}
      <p>{!state ? 'Checking…' : !state.enabled ? 'Not set up yet.' : state.verified ? 'Set up and verified on this device.' : 'Set up. Not verified on this device yet.'}</p>
      <Button variant="outline" onClick={() => void openPrompt()}>{state?.enabled ? 'Verify now' : 'Set up authenticator'}</Button>
      {state?.enabled ? (
        <div>
          <Field label="Current code, to reset the authenticator" value={code} maxLength={32} autoComplete="one-time-code" onChange={(event) => setCode(event.target.value)} />
          <Button variant="outline" disabled={code.trim().length < 6 || reset.isPending} onClick={() => reset.mutate()}>Reset authenticator</Button>
        </div>
      ) : null}
    </section>
  );
}
