/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { apiClient } from '../../../lib/api/client';
import { useAuth } from '../auth/useAuth';
import { hasScopes } from '../auth/hasScopes';
import './stage30-38.css';
import { Notice } from '../../../components/admin/Notice';
import { StatusBadge } from '../../../components/ui/Badge';
import { ButtonGroup } from '../../../components/admin/ButtonGroup';
import { SectionHeader } from '../../../components/admin/SectionHeader';

type LogRow = { id: string; at: string; provider: string; audience: string; template: string; to_hint: string; status: string; error?: string | null; cost?: number | null; related_type?: string | null; related_id?: string | null };
type SmsSnapshot = { provider: string; sender_id: string; message_category: string; staff_enabled: boolean; visitor_enabled: boolean; visitor_text: string; daily_limit: number; monthly_cap: number; test_number: string; test_message_only: boolean; delivery_receipts_supported: boolean };
const dateTime = (value: unknown) => { const date = new Date(String(value ?? '')); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date); };
const human = (value: unknown) => String(value ?? '—').replaceAll('_', ' ');
const providerOutcome = (status: string) => status === 'sent' ? 'Accepted by provider' : status === 'failed' ? 'Failed at provider/request stage' : status === 'skipped' ? 'Not sent (policy or limit)' : human(status);

export function NotificationLogPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const data: any = await apiClient.get('/admin/care/notifications'); setRows(Array.isArray(data) ? data : data.items ?? []); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Notification history could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <div className="stage-page">
    <PageHeader title="Notification delivery log" subtitle="A bounded, privacy-conscious view of the latest SMS attempts. Message bodies and provider credentials are not shown." actions={<Button variant="outline" onClick={() => void load()} disabled={loading}>Refresh</Button>} />
    <div className="stage-callout"><strong>Status definition</strong><p>“Accepted by provider” means the provider accepted the send request. It does not prove delivery to the handset. The configured MamboSMS integration does not expose delivery receipts in this app.</p></div>
    {error && <Notice tone="error">{error}</Notice>}
    <section className="stage-panel"><SectionHeader title="Recent attempts" note={<>{loading ? 'Loading…' : `${rows.length} attempt records (maximum 100)`}</>} />
      {rows.length === 0 && !loading ? <p className="stage-empty">No notification attempts have been recorded for the current log window.</p> : <div className="stage-table-scroll"><table className="stage-table"><caption>SMS send attempts</caption><thead><tr><th>Time</th><th>Recipient</th><th>Audience / template</th><th>Provider</th><th>Provider status</th><th>Reported cost</th><th>Error details</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{dateTime(row.at)}</td><td>{row.to_hint || 'Masked recipient not available'}</td><td>{human(row.audience)}<br /><span className="stage-label-note">{human(row.template)}</span></td><td>{row.provider}</td><td><StatusBadge status={String(row.status ?? '')}>{providerOutcome(row.status)}</StatusBadge></td><td>{row.cost == null ? 'Not reported' : String(row.cost)}<br /><span className="stage-label-note">Provider value; currency not specified</span></td><td>{row.error || '—'}</td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}

export function SmsSettingsPage() {
  const { user } = useAuth();
  const canCareWrite = hasScopes(user, ['carecfg:write']);
  const canSystemManage = hasScopes(user, ['system:manage']);
  const [snapshot, setSnapshot] = useState<SmsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [checkingBalance, setCheckingBalance] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [senderId, setSenderId] = useState('');
  const [category, setCategory] = useState('info');
  const [staffEnabled, setStaffEnabled] = useState(false);
  const [visitorEnabled, setVisitorEnabled] = useState(false);
  const [visitorText, setVisitorText] = useState('');
  const [dailyLimit, setDailyLimit] = useState('200');
  const [monthlyCap, setMonthlyCap] = useState('1000');
  const [testNumber, setTestNumber] = useState('');
  const [balance, setBalance] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await apiClient.get<SmsSnapshot>('/admin/care/sms/settings');
      setSnapshot(result); setSenderId(result.sender_id ?? ''); setCategory(result.message_category ?? 'info'); setStaffEnabled(Boolean(result.staff_enabled)); setVisitorEnabled(Boolean(result.visitor_enabled)); setVisitorText(result.visitor_text ?? ''); setDailyLimit(String(result.daily_limit ?? 200)); setMonthlyCap(String(result.monthly_cap ?? 1000)); setTestNumber(result.test_number ?? '');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'SMS settings could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if ((!canCareWrite && !canSystemManage) || saving) return;
    if (canCareWrite && (!Number.isInteger(Number(monthlyCap)) || Number(monthlyCap) < 0 || Number(monthlyCap) > 100000)) { setError('Monthly cap must be a whole number between 0 and 100000.'); return; }
    if (canCareWrite && testNumber.trim() && !/^\+?[0-9 ()-]{8,20}$/.test(testNumber.trim())) { setError('Enter a valid test destination phone number or leave it blank.'); return; }
    if (canSystemManage && visitorText.length > 160) { setError('The visitor SMS preview exceeds the 160-character message budget.'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      if (canCareWrite) {
        await Promise.all([
          apiClient.put('/admin/care/settings/sms.monthly_cap', { value: Number(monthlyCap) }),
          apiClient.put('/admin/care/settings/sms.test_number', { value: testNumber.trim() }),
        ]);
      }
      if (canSystemManage) {
        const parsedLimit = Number(dailyLimit);
        if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 10000) throw new Error('Daily SMS limit must be a whole number between 1 and 10000.');
        if (!senderId.trim() || senderId.trim().length > 11) throw new Error('Sender ID must be between 1 and 11 characters.');
        await apiClient.patch('/admin/settings/sms', { sender_id: senderId.trim(), message_category: category, staff_enabled: staffEnabled, visitor_enabled: visitorEnabled, visitor_text: visitorText, daily_limit: parsedLimit });
      }
      setNotice('SMS settings saved. Provider credentials remain deployment-managed and are not exposed here.'); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'SMS settings could not be saved. If one section saved before another failed, refresh and verify both sections.'); }
    finally { setSaving(false); }
  }

  async function testSms() {
    if (!canCareWrite || testing || !testNumber.trim()) return;
    const willSend = snapshot?.provider === 'mambosms';
    const message = willSend
      ? `Send a real test SMS to the configured test destination (${testNumber}) using MamboSMS? This does not create an SOS case.`
      : `Run the configured test-message path using the console provider? No handset SMS will be sent. This does not create an SOS case.`;
    if (!window.confirm(message)) return;
    setTesting(true); setError(''); setNotice('');
    try { await apiClient.post('/admin/care/sos/test-sms', {}); setNotice(willSend ? 'Test request accepted by the provider path. Check the notification log; handset delivery is not confirmed.' : 'Console dry-run completed; no real SMS was sent.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Test SMS could not be completed.'); }
    finally { setTesting(false); }
  }

  async function checkBalance() {
    if (!canCareWrite || checkingBalance || snapshot?.provider !== 'mambosms') return;
    if (!window.confirm('Query the MamboSMS account balance now? This contacts the configured provider and does not send an SMS.')) return;
    setCheckingBalance(true); setError(''); setNotice('');
    try { const result: any = await apiClient.post('/admin/care/sms/balance', {}); setBalance(Number(result.balance)); setNotice('Balance returned by the configured provider. Currency/units are shown exactly as returned by that API contract.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Provider balance could not be retrieved.'); }
    finally { setCheckingBalance(false); }
  }

  return <div className="stage-page">
    <PageHeader title="SMS provider & limits" subtitle="Deployment-managed provider selection, editable message controls, test destination, and provider-reported usage information." actions={<Button variant="outline" onClick={() => void load()} disabled={loading || saving}>Refresh</Button>} />
    {error && <Notice tone="error">{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    {loading ? <section className="stage-panel"><p>Loading SMS configuration…</p></section> : <>
      <div className="stage-summary-strip"><div><strong>{snapshot?.provider === 'mambosms' ? 'MamboSMS' : 'Console'}</strong><span>Provider from deployment config</span></div><div><strong>{snapshot?.provider === 'mambosms' ? 'Provider-backed' : 'Dry-run'}</strong><span>Send behavior</span></div><div><strong>{snapshot?.delivery_receipts_supported ? 'Supported' : 'Not supported'}</strong><span>Delivery receipts</span></div><div><strong>{snapshot?.monthly_cap ?? '—'}</strong><span>Configured monthly cap</span></div></div>
      <div className="stage-callout"><strong>Credential and delivery safety</strong><p>The provider and API credentials are configured on the server. This screen never displays or persists secrets. MamboSMS may return a cost with a successful send, but this integration does not provide delivery reports; “accepted” is not the same as “delivered”. The test-message action is restricted to the configured test destination and never creates an SOS case.</p></div>
      <form className="stage-panel stage-form" onSubmit={(event) => void save(event)}>
        <h2>Configuration</h2>
        <div className="stage-settings-grid">
          <Field label="Provider (deployment only)" value={snapshot?.provider ?? '—'} readOnly />
          <Field label="Sender ID (maximum 11 characters)" value={senderId} onChange={(event) => setSenderId(event.target.value)} maxLength={11} disabled={!canSystemManage} />
          <Field label="Message category" kind="select" value={category} onChange={(event) => setCategory(event.target.value)} disabled={!canSystemManage}><option value="non_customised">Non-customised</option><option value="info">Info</option><option value="customised">Customised</option></Field>
          <Field label="Daily send limit" type="number" value={dailyLimit} min={1} max={10000} step={1} onChange={(event) => setDailyLimit(event.target.value)} disabled={!canSystemManage} />
          <Field label="Monthly care-SMS cap (0 pauses care SMS sending)" type="number" value={monthlyCap} min={0} max={100000} step={1} onChange={(event) => setMonthlyCap(event.target.value)} disabled={!canCareWrite} />
          <Field label="Test destination number" value={testNumber} onChange={(event) => setTestNumber(event.target.value)} maxLength={20} disabled={!canCareWrite} placeholder="+256…" />
        </div>
        <div className="stage-form-columns">
          <label className="stage-inline-checkbox"><input type="checkbox" checked={staffEnabled} disabled={!canSystemManage} onChange={(event) => setStaffEnabled(event.target.checked)} /><span>Staff SMS enabled</span></label>
          <label className="stage-inline-checkbox"><input type="checkbox" checked={visitorEnabled} disabled={!canSystemManage} onChange={(event) => setVisitorEnabled(event.target.checked)} /><span>Visitor SMS enabled</span></label>
        </div>
        <div><Field label="Visitor SMS text preview (maximum 160 characters)" kind="textarea" value={visitorText} maxLength={300} onChange={(event) => setVisitorText(event.target.value)} disabled={!canSystemManage} /><p className="stage-label-note"><span className="stage-count">{visitorText.length}/160</span> characters. {visitorText.length > 160 ? 'Over budget; save is blocked.' : 'No message body is stored in the notification log.'}</p></div>
        {!canSystemManage && <p className="stage-label-note">Sender ID, category, staff/visitor enablement, and visitor text are read-only because these global SMS settings require system:manage. Monthly cap and test destination require carecfg:write.</p>}
        <ButtonGroup spaced><Button type="submit" disabled={saving || (!canCareWrite && !canSystemManage)}>{saving ? 'Saving…' : 'Save settings'}</Button><Button type="button" variant="outline" disabled={testing || !canCareWrite || !testNumber.trim()} onClick={() => void testSms()}>{testing ? 'Testing…' : 'Send test message'}</Button>{snapshot?.provider === 'mambosms' && <Button type="button" variant="outline" disabled={checkingBalance || !canCareWrite} onClick={() => void checkBalance()}>{checkingBalance ? 'Checking…' : 'Check provider balance'}</Button>}</ButtonGroup>
        {balance !== null && <Notice>Provider-reported balance value: <strong>{balance}</strong> (currency/units are not inferred).</Notice>}
        <p className="stage-label-note">The monthly cap is enforced for care SOS and critical-alert SMS. A cap of 0 pauses these care SMS sends. The daily limit is enforced across the notification service.</p>
      </form>
    </>}
  </div>;
}
