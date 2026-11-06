import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api/client';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { PillButton } from '../ui/PillButton';

type AuditItem = { id: string; at: string; action: string; item_type: string; item_label?: string | null; event_type?: string; severity?: string; outcome?: string; message?: string | null; request_id?: string | null; http_status?: number | null };
type TotpStatus = { enabled: boolean; verified: boolean };
type Enrollment = { secret: string; otpauth_uri: string };
type Confirmed = { recovery_codes: string[] };
function chipKind(severity?: string): 'ok' | 'rv' | 'pd' | 'bad' { return severity === 'critical' || severity === 'error' ? 'bad' : severity === 'warning' ? 'rv' : 'ok'; }
function when(value: string) { return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'detail' in error) return String((error as { detail: unknown }).detail);
  return error instanceof Error ? error.message : fallback;
}

export function AuditScreen() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [totpStatus, setTotpStatus] = useState<TotpStatus | null>(null);
  const [totpChecking, setTotpChecking] = useState(true);
  const [totpError, setTotpError] = useState('');
  const [totpBusy, setTotpBusy] = useState(false);
  const [totpSecret, setTotpSecret] = useState('');
  const [totpUri, setTotpUri] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const refreshTotp = useCallback(async () => {
    setTotpChecking(true); setTotpError('');
    try {
      setTotpStatus(await apiRequest<TotpStatus>('/mail/totp/status'));
    } catch (reason) {
      setTotpStatus(null);
      setTotpError(errorMessage(reason, 'Could not check authenticator status.'));
    } finally { setTotpChecking(false); }
  }, []);

  const unlocked = Boolean(totpStatus?.enabled && totpStatus?.verified && recoveryCodes.length === 0);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await apiRequest<{ items: AuditItem[] }>('/field/audit');
      setItems(result.items ?? []);
    } catch (reason) {
      setError(errorMessage(reason, 'Could not load your activity history.'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refreshTotp(); }, [refreshTotp]);
  useEffect(() => { if (unlocked) void load(); }, [unlocked, load]);

  async function beginEnrollment() {
    setTotpBusy(true); setTotpError('');
    try {
      const result = await apiRequest<Enrollment>('/mail/totp/enroll', { method: 'POST', body: JSON.stringify({}) });
      setTotpSecret(result.secret); setTotpUri(result.otpauth_uri);
    } catch (reason) {
      setTotpError(errorMessage(reason, 'Could not start authenticator setup.'));
    } finally { setTotpBusy(false); }
  }

  async function verify() {
    setTotpBusy(true); setTotpError('');
    try {
      if (totpSecret) {
        const result = await apiRequest<Confirmed>('/mail/totp/confirm', { method: 'POST', body: JSON.stringify({ code: totpCode.trim() }) });
        await apiRequest('/mail/totp/verify', { method: 'POST', body: JSON.stringify({ code: totpCode.trim() }) });
        setTotpStatus({ enabled: true, verified: true });
        setRecoveryCodes(result.recovery_codes ?? []);
        setTotpSecret(''); setTotpUri(''); setTotpCode('');
      } else {
        await apiRequest('/mail/totp/verify', { method: 'POST', body: JSON.stringify({ code: totpCode.trim() }) });
        setTotpCode('');
        await refreshTotp();
      }
    } catch (reason) {
      setTotpError(errorMessage(reason, 'Authenticator verification failed. Check the code and try again.'));
    } finally { setTotpBusy(false); }
  }

  return <section className="screen" aria-labelledby="audit-heading">
    <header className="screen-heading"><div><p className="eyebrow">ACCOUNT HISTORY</p><h2 id="audit-heading">My activity & errors</h2><p>Recent actions and system issues linked to your account.</p></div>{unlocked && <PillButton tone="ghost" size="sm" showArrow={false} onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</PillButton>}</header>

    {totpChecking && <Card><p>Checking authenticator protection…</p></Card>}
    {totpError && <Card className="empty-state"><h3>Authenticator verification unavailable</h3><p>{totpError}</p><PillButton onClick={() => void refreshTotp()}>Retry</PillButton></Card>}
    {!totpChecking && !totpError && !unlocked && <Card className="mk-profile-section">
      <div className="mk-profile-section__heading"><h3>Verify before viewing your audit history</h3><Chip kind="rv">Protected</Chip></div>
      <p>Activity history can contain sensitive account and care-operation details. A verified authenticator is required before any audit records are loaded.</p>
      {!totpStatus?.enabled && !totpSecret && <PillButton onClick={() => void beginEnrollment()} disabled={totpBusy}>{totpBusy ? 'Starting setup…' : 'Set up authenticator'}</PillButton>}
      {totpSecret && <div className="stack-form">
        <p>Add this account to an authenticator app. Use the setup link if supported, or enter the key manually.</p>
        <p><a href={totpUri}>Open authenticator setup link</a></p>
        <p><strong>Secret key</strong><br /><code className="mk-totp-secret">{totpSecret}</code></p>
        <label htmlFor="audit-totp-code">Current authenticator code</label>
        <input id="audit-totp-code" value={totpCode} onChange={(event) => setTotpCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" maxLength={8} />
        <PillButton onClick={() => void verify()} disabled={totpBusy || totpCode.trim().length < 6}>{totpBusy ? 'Verifying…' : 'Confirm and unlock'}</PillButton>
      </div>}
      {totpStatus?.enabled && !totpStatus.verified && !totpSecret && <div className="stack-form">
        <label htmlFor="audit-totp-code">Authenticator code</label>
        <input id="audit-totp-code" value={totpCode} onChange={(event) => setTotpCode(event.target.value)} autoComplete="one-time-code" inputMode="numeric" maxLength={32} />
        <PillButton onClick={() => void verify()} disabled={totpBusy || totpCode.trim().length < 6}>{totpBusy ? 'Verifying…' : 'Verify and unlock'}</PillButton>
      </div>}
      {recoveryCodes.length > 0 && <div className="stack-form">
        <p><strong>Save these one-time recovery codes securely.</strong> They will not be shown again.</p>
        <ul>{recoveryCodes.map((item) => <li key={item}><code>{item}</code></li>)}</ul>
        <PillButton onClick={() => setRecoveryCodes([])}>I have saved my recovery codes</PillButton>
      </div>}
    </Card>}

    {unlocked && error && <Card className="empty-state"><h3>Activity history unavailable</h3><p>{error}</p><PillButton onClick={() => void load()}>Try again</PillButton></Card>}
    {unlocked && !loading && !error && items.length === 0 && <Card className="empty-state"><h3>No activity recorded yet</h3><p>Important actions and any errors linked to your account will appear here.</p></Card>}
    {unlocked && loading && <Card><p>Loading your activity…</p></Card>}
    {unlocked && <div className="mk-history-list">{items.map(item => <Card key={item.id} className="history-card"><div className="mk-profile-section__heading"><strong>{item.item_label || item.action.replaceAll('.', ' ').replaceAll('_', ' ')}</strong><Chip kind={chipKind(item.severity)}>{item.severity || 'info'}</Chip></div><p>{item.message || `${item.action} · ${item.outcome || 'recorded'}`}</p><small>{when(item.at)} · {item.event_type || 'activity'}{item.http_status ? ` · HTTP ${item.http_status}` : ''}</small>{item.request_id && <p><small>Reference: <code>{item.request_id}</code></small></p>}</Card>)}</div>}
    <p className="muted">This view is limited to activity associated with your signed-in account. Clinical record contents and passwords are not displayed.</p>
  </section>;
}
