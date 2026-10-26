import type { FormEvent } from 'react';
import { copy } from '../copy';

type Props = { identifier: string; password: string; busy: boolean; online: boolean; onIdentifier: (value: string) => void; onPassword: (value: string) => void; onSubmit: (event: FormEvent) => void };
export function LoginScreen({ identifier, password, busy, online, onIdentifier, onPassword, onSubmit }: Props) {
  return <section className="panel login-panel"><h2>{copy.login.heading}</h2>
    {!online && <p role="status">{copy.login.offline}</p>}
    <form onSubmit={onSubmit}>
      <label htmlFor="identifier">{copy.login.identifier}</label>
      <input id="identifier" autoComplete="username" value={identifier} onChange={(event) => onIdentifier(event.target.value)} required />
      <label htmlFor="password">{copy.login.password}</label>
      <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => onPassword(event.target.value)} required />
      <button type="submit" disabled={busy || !online}>{busy ? copy.login.working : copy.login.submit}</button>
    </form>
  </section>;
}
