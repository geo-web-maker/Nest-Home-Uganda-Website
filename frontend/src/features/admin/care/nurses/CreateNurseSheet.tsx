import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Checkbox } from '../../../../components/ui/Checkbox';
import { Field } from '../../../../components/ui/Field';
import { Notice } from '../../../../components/admin/Notice';
import { apiClient } from '../../../../lib/api/client';
import { CareSheet } from '../components/CareSheet';

type SupervisorOption = { id: string; name: string; email: string; is_superadmin: boolean };

/** Superadmin only: creates an active nurse with a chosen password, no invitation link needed. */
export function CreateNurseSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [staffNumber, setStaffNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [supervisorId, setSupervisorId] = useState('');
  const [options, setOptions] = useState<SupervisorOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    apiClient.get<SupervisorOption[]>('/admin/care/nurses/supervisor-options')
      .then((items) => { if (alive) setOptions(Array.isArray(items) ? items : []); })
      .catch(() => { /* the supervisor is optional here, so the form still works without the list */ });
    return () => { alive = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await apiClient.post('/admin/care/nurses/direct', {
        name: name.trim(), email: email.trim(), phone: phone.trim(),
        staff_number: staffNumber.trim(), password,
        ...(supervisorId ? { supervisor_id: supervisorId } : {}),
      });
      onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The nurse account could not be created.');
    } finally { setBusy(false); }
  }

  return (
    <CareSheet title="Create nurse with password" onClose={onClose}>
      <form className="care-form invite-nurse-form" onSubmit={submit}>
        <p>Super administrators only. The account is active straight away and no invitation is sent. Share the password with the nurse yourself.</p>
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Full name" value={name} onChange={(event) => setName(event.target.value)} required requiredLabel="required" minLength={2} maxLength={80} autoComplete="off" />
        <Field label="Email address" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required requiredLabel="required" autoComplete="off" />
        <Field label="Phone number" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required requiredLabel="required" minLength={9} maxLength={24} autoComplete="off" />
        <Field label="Staff number" value={staffNumber} onChange={(event) => setStaffNumber(event.target.value)} required requiredLabel="required" minLength={2} maxLength={40} />
        <Field label="Password (at least 12 characters)" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required requiredLabel="required" minLength={12} maxLength={200} autoComplete="new-password" />
        <Checkbox className="care-check" label="Show password" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} />
        <Field kind="select" label="Supervisor (optional)" value={supervisorId} onChange={(event) => setSupervisorId(event.target.value)}>
          <option value="">No supervisor</option>
          {options.map((option) => <option key={option.id} value={option.id}>{option.name} ({option.is_superadmin ? 'Super admin' : option.email})</option>)}
        </Field>
        <div className="care-sheet-actions"><Button type="submit" disabled={busy}>{busy ? 'Creating nurse…' : 'Create nurse'}</Button><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button></div>
      </form>
    </CareSheet>
  );
}
