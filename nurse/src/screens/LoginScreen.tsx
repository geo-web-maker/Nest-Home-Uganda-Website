import type { FormEvent } from 'react';
import { copy } from '../copy';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { Banner } from '../ui/Banner';
import { Card } from '../ui/Card';
import { PillButton } from '../ui/PillButton';

type Props = { identifier: string; password: string; busy: boolean; online: boolean; errorMessage?: string; onIdentifier: (value: string) => void; onPassword: (value: string) => void; onSubmit: (event: FormEvent) => void };
export function LoginScreen({ identifier, password, busy, online, errorMessage, onIdentifier, onPassword, onSubmit }: Props) {
  return <section className="login-screen" aria-labelledby="login-heading">
    <Card className="login-panel mk-login-panel">
      <div className="login-mark" aria-hidden="true"><svg viewBox="0 0 40 34" width="48" height="41" fill="none" focusable="false">
        <path d="M20 1v6M17 4h6" stroke="#C79A3B" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="14" cy="16" rx="5" ry="6.5" fill="#EADFBC" stroke="#C79A3B" strokeOpacity=".35" />
        <ellipse cx="22" cy="14.5" rx="5" ry="6.5" fill="#F4EDD3" stroke="#C79A3B" strokeOpacity=".35" />
        <ellipse cx="29" cy="17" rx="4.5" ry="6" fill="#EADFBC" stroke="#C79A3B" strokeOpacity=".35" />
        <path d="M3 21c4 11 30 11 34 0M6 23c6 7 22 7 28 0M10 26c5 4 15 4 20 0" stroke="#C79A3B" strokeWidth="1.8" strokeLinecap="round" />
      </svg></div>
      <h1 id="login-heading">{copy.login.heading}</h1>
      <p className="login-subtitle">{copy.login.subtitle}</p>
      {!online && <Banner tone="warn">{copy.login.offline}</Banner>}
      {errorMessage && <Banner tone="warn" role="alert">{errorMessage}</Banner>}
      <form onSubmit={onSubmit}>
        <label htmlFor="identifier">{copy.login.identifier}</label>
        <input id="identifier" autoComplete="username" value={identifier} onChange={(event) => onIdentifier(event.target.value)} required />
        <label htmlFor="password">{copy.login.password}</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => onPassword(event.target.value)} required />
        <PillButton type="submit" tone="forest" disabled={busy || !online} size="full">{busy ? copy.login.working : copy.login.submit}</PillButton>
      </form>
      <p className="forgot-password"><span>{copy.login.forgotPassword}</span><small>{copy.login.forgotPasswordHelp}</small></p>
    </Card>
    <ThemeSwitch />
  </section>;
}
