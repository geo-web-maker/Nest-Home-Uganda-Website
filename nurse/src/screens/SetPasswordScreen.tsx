import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../lib/api/client';
import { copy } from '../copy';
import { MIN_PASSWORD_LENGTH, isWeakPassword, passwordStrength } from '../lib/passwordStrength';
import { Banner } from '../ui/Banner';
import { Card } from '../ui/Card';
import { PillButton } from '../ui/PillButton';


/** Public route: redeems the one-time link from an invite or password-reset email. */
export function SetPasswordScreen() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const isInvite = params.get('purpose') === 'invite';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const text = copy.setPassword;
  const strength = passwordStrength(password);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) return setError(text.errors.short);
    if (isWeakPassword(password)) return setError(text.errors.weak);
    if (password !== confirm) return setError(text.errors.mismatch);
    setBusy(true);
    setError('');
    try {
      await apiRequest(isInvite ? '/auth/accept-invite' : '/auth/set-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
    } catch (caught) {
      const status = (caught as { status?: number }).status;
      setError(status === 429 ? text.errors.rateLimited : status === 422 && /password/i.test(String((caught as { detail?: unknown }).detail)) ? text.errors.weak : status === 422 ? text.errors.link : text.errors.failed);
    } finally {
      setBusy(false);
    }
  }

  return <section className="login-screen" aria-labelledby="set-password-heading">
    <Card className="login-panel mk-login-panel">
      <h1 id="set-password-heading">{text.heading}</h1>
      {done ? <>
        <p role="status">{text.done}</p>
        <Link className="set-password-link" to="/">{text.toLogin}</Link>
      </> : token.length === 0 ? <Banner tone="warn" role="alert">{text.errors.noToken}</Banner> : <>
        <p className="login-subtitle">{text.hint}</p>
        {error && <Banner tone="warn" role="alert">{error}</Banner>}
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="new-password">{text.password}</label>
          <input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} required />
          {strength !== 'empty' && <small className="password-strength" data-level={strength} aria-live="polite">{text.strength[strength]}</small>}
          <label htmlFor="confirm-password">{text.confirm}</label>
          <input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(event) => { setConfirm(event.target.value); setError(''); }} required />
          <PillButton type="submit" tone="forest" disabled={busy} size="full">{busy ? text.submitting : text.submit}</PillButton>
        </form>
      </>}
    </Card>
  </section>;
}
