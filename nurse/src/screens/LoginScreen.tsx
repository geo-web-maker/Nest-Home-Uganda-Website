import type { FormEvent } from 'react';
import { copy } from '../copy';
import { Banner } from '../ui/Banner';
import { Card } from '../ui/Card';
import { PillButton } from '../ui/PillButton';
import { MARK_CROSS, MARK_LEAVES, MARK_PETALS, MARK_VIEWBOX } from '../ui/markPaths';

type Props = { identifier: string; password: string; busy: boolean; online: boolean; errorMessage?: string; onIdentifier: (value: string) => void; onPassword: (value: string) => void; onSubmit: (event: FormEvent) => void };
export function LoginScreen({ identifier, password, busy, online, errorMessage, onIdentifier, onPassword, onSubmit }: Props) {
  return <section className="login-screen" aria-labelledby="login-heading">
    <Card className="login-panel mk-login-panel">
      <div className="login-mark" aria-hidden="true"><svg viewBox={MARK_VIEWBOX} width="48" height="53" focusable="false">
        <path fill="#08675F" d={MARK_LEAVES} />
        <path fill="#08675F" d={MARK_CROSS} />
        {MARK_PETALS.map((petal) => <path key={petal.fill} fill={petal.fill} d={petal.d} />)}
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
  </section>;
}
