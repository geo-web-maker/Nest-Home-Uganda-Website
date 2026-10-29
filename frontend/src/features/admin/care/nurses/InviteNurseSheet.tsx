import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Field } from '../../../../components/ui/Field';
import { apiClient } from '../../../../lib/api/client';
import { CareSheet } from '../components/CareSheet';
import { Notice } from '../../../../components/admin/Notice';

type SupervisorOption = { id: string; name: string; email: string; is_superadmin: boolean };

export function InviteNurseSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [staffNumber, setStaffNumber] = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [options, setOptions] = useState<SupervisorOption[]>([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setOptionsLoaded(false);
    setLoadFailed(false);
    apiClient.get<SupervisorOption[]>('/admin/care/nurses/supervisor-options').then((items) => {
      if (!alive) return;
      const list = Array.isArray(items) ? items : [];
      setOptions(list);
      const only = list.length === 1 ? list[0] : undefined;
      if (only) setSupervisorId(only.id);
    }).catch(() => {
      if (alive) setLoadFailed(true);
    }).finally(() => { if (alive) setOptionsLoaded(true); });
    return () => { alive = false; };
  }, [attempt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await apiClient.post('/admin/care/nurses', {
        name: name.trim(), email: email.trim(), phone: phone.trim(),
        staff_number: staffNumber.trim(), supervisor_id: supervisorId.trim(),
      });
      onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The invitation could not be created.');
    } finally { setBusy(false); }
  }

  return (
    <CareSheet title="Invite nurse" onClose={onClose}>
      <form className="care-form invite-nurse-form" onSubmit={submit}>
        <p>Enter the nurse's contact details and assign an active supervisor before sending an invitation.</p>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Full name" value={name} onChange={(event) => setName(event.target.value)} required requiredLabel="required" minLength={2} maxLength={80} autoComplete="name" />
        <Field label="Email address" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required requiredLabel="required" autoComplete="email" />
        <Field label="Phone number" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required requiredLabel="required" minLength={9} maxLength={24} autoComplete="tel" />
        <Field label="Staff number" value={staffNumber} onChange={(event) => setStaffNumber(event.target.value)} required requiredLabel="required" minLength={2} maxLength={40} />
        {loadFailed ? (
          <>
            <Notice tone="error">The list of supervisors could not be loaded. <Button type="button" variant="outline" onClick={() => setAttempt((n) => n + 1)}>Try again</Button></Notice>
            <Field label="Supervisor user ID" value={supervisorId} onChange={(event) => setSupervisorId(event.target.value)} required requiredLabel="required" autoComplete="off" />
          </>
        ) : (
          <Field kind="select" label="Supervisor" value={supervisorId} onChange={(event) => setSupervisorId(event.target.value)} required requiredLabel="required" disabled={!optionsLoaded}>
            <option value="">{!optionsLoaded ? 'Loading supervisors…' : options.length === 0 ? 'No active supervisors available' : 'Select a supervisor'}</option>
            {options.map((option) => <option key={option.id} value={option.id}>{option.name} ({option.is_superadmin ? 'Super admin' : option.email})</option>)}
          </Field>
        )}
        <p>Only active accounts within your permitted reach are listed. The server re-checks the assignment.</p>
        <div className="care-sheet-actions"><Button type="submit" disabled={busy}>{busy ? 'Creating invitation…' : 'Create invitation'}</Button><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button></div>
      </form>
    </CareSheet>
  );
}
