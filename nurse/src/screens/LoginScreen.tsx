import type { FormEvent } from 'react';
import { copy } from '../copy';
import { ThemeSwitch } from '../components/ThemeSwitch';

type Props = { identifier: string; password: string; busy: boolean; online: boolean; onIdentifier: (value: string) => void; onPassword: (value: string) => void; onSubmit: (event: FormEvent) => void };
export function LoginScreen({ identifier, password, busy, online, onIdentifier, onPassword, onSubmit }: Props) {
  return <section className="login-screen" aria-labelledby="login-heading">
    <div className="login-mark" aria-hidden="true">✦</div>
    <section className="panel login-panel">
      <h1 id="login-heading">{copy.login.heading}</h1>
      <p className="login-subtitle">{copy.login.subtitle}</p>
      {!online && <p role="status">{copy.login.offline}</p>}
      <form onSubmit={onSubmit}>
        <label htmlFor="identifier">{copy.login.identifier}</label>
        <input id="identifier" autoComplete="username" value={identifier} onChange={(event) => onIdentifier(event.target.value)} required />
        <label htmlFor="password">{copy.login.password}</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => onPassword(event.target.value)} required />
        <button type="submit" disabled={busy || !online}>{busy ? copy.login.working : copy.login.submit}<span aria-hidden="true">→</span></button>
      </form>
      <p className="forgot-password"><span>{copy.login.forgotPassword}</span><small>{copy.login.forgotPasswordHelp}</small></p>
    </section>
    <ThemeSwitch />
  </section>;
}
