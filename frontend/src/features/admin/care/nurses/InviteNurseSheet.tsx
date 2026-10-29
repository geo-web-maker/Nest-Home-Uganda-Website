import { useState, type FormEvent } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Field } from '../../../../components/ui/Field';
import { apiClient } from '../../../../lib/api/client';
import { CareSheet } from '../components/CareSheet';

export function InviteNurseSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [staffNumber, setStaffNumber] = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
        {error && <p role="alert" className="care-error">{error}</p>}
        <Field label="Full name" value={name} onChange={(event) => setName(event.target.value)} required requiredLabel="required" minLength={2} maxLength={80} autoComplete="name" />
        <Field label="Email address" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required requiredLabel="required" autoComplete="email" />
        <Field label="Phone number" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required requiredLabel="required" minLength={9} maxLength={24} autoComplete="tel" />
        <Field label="Staff number" value={staffNumber} onChange={(event) => setStaffNumber(event.target.value)} required requiredLabel="required" minLength={2} maxLength={40} />
        <Field label="Supervisor user ID" value={supervisorId} onChange={(event) => setSupervisorId(event.target.value)} required requiredLabel="required" minLength={8} maxLength={160} />
        <p>The server verifies that the supervisor account is active and that this assignment is within your permitted reach.</p>
        <div className="care-sheet-actions"><Button type="submit" disabled={busy}>{busy ? 'Creating invitation…' : 'Create invitation'}</Button><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button></div>
      </form>
    </CareSheet>
  );
}
