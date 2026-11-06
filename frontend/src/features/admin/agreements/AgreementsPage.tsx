import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Notice } from '../../../components/admin/Notice';
import { Button } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/ui/Badge';
import { apiClient, ApiError } from '../../../lib/api/client';
import { useAuth } from '../auth/useAuth';
import styles from './AgreementsPage.module.css';
import { AgreementDiagnostics } from './AgreementDiagnostics';

type Owner = 'staff' | 'clinical' | 'client' | 'either';
type AgreementField = { value: unknown; owner: Owner; revision: number; entered_by_staff: boolean };
type AgreementRow = {
  id: string; reference: string; status: string; client_name?: string | null; patient_name?: string | null;
  client_email?: string | null; client_phone?: string | null; assigned_nurse_id?: string | null;
  created_at: string; expires_at?: string | null;
};
type AgreementDetail = AgreementRow & {
  template_version: number; template_hash: string; fields: Record<string, AgreementField>;
  schedule_b_computed: Record<string, string | number>; events: Array<{ type: string; at: string; actor: string; detail: Record<string, unknown> }>;
  sealed?: { sealed_at?: string; pdf_sha256?: string };
};
type AgreementList = { items: AgreementRow[]; total: number };
type Preview = { html: string };
type TemplateMessage = { subject: string; preheader: string; body: string; button: string; footer_note: string; version: number; is_default: boolean };
type AgreementTemplateVersion = { version: number; published: boolean; template_hash: string; published_at?: string | null; source_file?: string | null };
type MessagePreview = { subject?: string; html?: string; text?: string; body?: string; characters?: number; segments?: number; gsm7?: boolean };
type MessageStage = 'agreement_sent' | 'otp_sign' | 'otp_view' | 'reminder_1' | 'reminder_2' | 'expiring_soon' | 'expired' | 'changes_requested' | 'staff_revised' | 'client_signed_client' | 'client_signed_staff' | 'completed_client' | 'voided' | 'amendment_sent' | 'payment_due';

const stages: MessageStage[] = ['agreement_sent', 'otp_sign', 'otp_view', 'reminder_1', 'reminder_2', 'expiring_soon', 'expired', 'changes_requested', 'staff_revised', 'client_signed_client', 'client_signed_staff', 'completed_client', 'voided', 'amendment_sent', 'payment_due'];
const smsStages = new Set<MessageStage>(['agreement_sent', 'otp_sign', 'otp_view', 'reminder_1', 'reminder_2', 'expiring_soon', 'staff_revised', 'client_signed_client', 'completed_client', 'voided', 'amendment_sent', 'payment_due']);
const tabs = [
  { id: 'parties', label: 'Parties' }, { id: 'schedule_a', label: 'Schedule A' },
  { id: 'schedule_b', label: 'Schedule B' }, { id: 'schedule_c', label: 'Schedule C' },
  { id: 'preview', label: 'Preview' }, { id: 'timeline', label: 'Timeline' },
  { id: 'send', label: 'Send' }, { id: 'messages', label: 'Messages' }, { id: 'template', label: 'Template versions' },
] as const;
type Tab = typeof tabs[number]['id'];

function label(path: string): string { return path.split('.').at(-1)?.replaceAll('_', ' ') ?? path; }
function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

export function AgreementsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AgreementRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgreementDetail | null>(null);
  const [tab, setTab] = useState<Tab>('parties');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sourceEnquiryId, setSourceEnquiryId] = useState('');
  const [assignedNurseId, setAssignedNurseId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [enteredStaff, setEnteredStaff] = useState<Record<string, boolean>>({});
  const [conflicts, setConflicts] = useState<Record<string, { local: string; remote: string; revision: number }>>({});
  const [channels, setChannels] = useState<'email' | 'sms' | 'both'>('both');
  const [messageStage, setMessageStage] = useState<MessageStage>('agreement_sent');
  const [messageChannel, setMessageChannel] = useState<'email' | 'sms'>('email');
  const [message, setMessage] = useState<TemplateMessage | null>(null);
  const [messagePreview, setMessagePreview] = useState<MessagePreview | null>(null);
  const [templateJson, setTemplateJson] = useState('');
  const [templateInfo, setTemplateInfo] = useState<{ version?: number; published?: boolean; template_hash?: string; clauses?: Record<string, string>; source_file?: string | null; versions?: AgreementTemplateVersion[]; published_version?: number | null } | null>(null);
  const [bloomwellName, setBloomwellName] = useState('');
  const signatureCanvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const canWrite = Boolean(user?.is_superadmin || user?.scopes.includes('agreements:write'));
  const canManageTemplates = Boolean(user?.is_superadmin || user?.scopes.includes('agreements:templates'));
  const canDiagnose = Boolean(user?.is_superadmin || user?.scopes.includes('agreements:diagnostics'));
  const canViewNotifications = Boolean(user?.is_superadmin || user?.scopes.includes('agreements:notifications') || user?.scopes.includes('agreements:templates'));
  const canSign = Boolean(user?.is_superadmin || user?.scopes.includes('agreements:sign'));
  const canVoid = Boolean(user?.is_superadmin || user?.scopes.includes('agreements:void'));
  const visibleTabs = tabs.filter((entry) => entry.id === 'messages' ? canViewNotifications : entry.id === 'template' ? canManageTemplates : true);

  const loadList = useCallback(async () => {
    try {
      const result = await apiClient.get<AgreementList>('/admin/agreements', { params: { q: search, status } });
      setRows(result.items);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load agreements.'); }
  }, [search, status]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const result = await apiClient.get<AgreementDetail>(`/admin/agreements/${id}`);
      setDetail(result);
      setDrafts({});
      setConflicts({});
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load this agreement.'); }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => { if (selected) void loadDetail(selected); else setDetail(null); }, [selected, loadDetail]);

  const create = async () => {
    setBusy(true); setError('');
    try {
      const created = await apiClient.post<AgreementDetail>('/admin/agreements', {
        ...(sourceEnquiryId.trim() ? { enquiry_id: sourceEnquiryId.trim() } : {}),
        ...(assignedNurseId.trim() ? { assigned_nurse_id: assignedNurseId.trim() } : {}),
      });
      await loadList(); setSelected(created.id); setTab('parties');
      setSourceEnquiryId(''); setAssignedNurseId('');
      setNotice(`Created ${created.reference}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create an agreement.'); }
    finally { setBusy(false); }
  };

  const saveField = async (path: string, override?: { value: string; revision: number }) => {
    if (!detail) return;
    const current = detail.fields[path];
    if (!current) return;
    const local = override?.value ?? drafts[path] ?? valueText(current.value);
    setBusy(true); setError(''); setNotice('');
    try {
      await apiClient.patch(`/admin/agreements/${detail.id}`, { changes: [{
        path, value: local, expected_revision: override?.revision ?? current.revision,
        entered_by_staff: enteredStaff[path] ?? current.entered_by_staff,
      }] });
      await loadDetail(detail.id); await loadList(); setNotice(`${label(path)} saved.`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        const latest = await apiClient.get<AgreementDetail>(`/admin/agreements/${detail.id}`);
        const remote = latest.fields[path];
        setDetail(latest);
        setConflicts((old) => ({ ...old, [path]: { local, remote: valueText(remote?.value), revision: remote?.revision ?? 0 } }));
        setError(`Another person changed ${label(path)}. Choose which value to keep.`);
      } else setError(cause instanceof Error ? cause.message : 'The field could not be saved.');
    } finally { setBusy(false); }
  };

  const send = async () => {
    if (!detail) return;
    setBusy(true); setError('');
    try {
      const result = await apiClient.post<{ delivery: Record<string, boolean> }>(`/admin/agreements/${detail.id}/send`, { channels, expires_days: 14 });
      await loadDetail(detail.id); await loadList();
      setNotice(`Agreement sent. Delivery: ${Object.entries(result.delivery).map(([k, v]) => `${k} ${v ? 'sent' : 'failed'}`).join(', ') || 'none requested'}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The agreement could not be sent.'); }
    finally { setBusy(false); }
  };

  const loadMessage = async (stage: MessageStage, channel: 'email' | 'sms') => {
    setMessageStage(stage); setMessageChannel(channel); setError('');
    try {
      const result = await apiClient.get<TemplateMessage>(`/admin/agreements/message-templates/${stage}/${channel}`);
      setMessage(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load this message template.'); }
  };

  const saveMessage = async () => {
    if (!message) return;
    setBusy(true); setError('');
    try {
      await apiClient.put(`/admin/agreements/message-templates/${messageStage}/${messageChannel}`, message);
      await loadMessage(messageStage, messageChannel); setMessagePreview(null); setNotice('Message template saved and audited.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this message.'); }
    finally { setBusy(false); }
  };

  const previewMessage = async () => {
    if (!message) return;
    setBusy(true); setError('');
    try {
      const result = await apiClient.post<MessagePreview>(`/admin/agreements/message-templates/${messageStage}/${messageChannel}/preview`, message);
      setMessagePreview(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not preview this message.'); }
    finally { setBusy(false); }
  };

  const testSendMessage = async () => {
    setBusy(true); setError('');
    try {
      const result = await apiClient.post<{ sent: boolean; message: string }>(`/admin/agreements/message-templates/${messageStage}/${messageChannel}/test-send`, {});
      setNotice(result.message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The test message could not be sent.'); }
    finally { setBusy(false); }
  };

  const openTemplate = async () => {
    setBusy(true); setError('');
    try {
      const result = await apiClient.get<{ version?: number; published?: boolean; template_hash?: string; clauses?: Record<string, string>; source_file?: string | null; versions?: AgreementTemplateVersion[]; published_version?: number | null }>('/admin/agreements/template/current');
      setTemplateInfo(result); setTemplateJson(JSON.stringify(result.clauses ?? {}, null, 2));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load template versions.'); }
    finally { setBusy(false); }
  };

  const loadTemplateVersion = async (version: number) => {
    setBusy(true); setError('');
    try {
      const result = await apiClient.get<{ version: number; published: boolean; template_hash: string; clauses: Record<string, string>; source_file?: string | null; published_at?: string | null }>(`/admin/agreements/template/${version}`);
      setTemplateInfo((current) => ({ ...current, ...result }));
      setTemplateJson(JSON.stringify(result.clauses, null, 2));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load this template version.'); }
    finally { setBusy(false); }
  };

  const saveTemplateDraft = async () => {
    setBusy(true); setError('');
    try {
      const clauses = JSON.parse(templateJson) as Record<string, string>;
      const result = await apiClient.post<{ version: number; template_hash: string }>('/admin/agreements/template/drafts', { clauses });
      await openTemplate();
      setNotice(`Draft template v${result.version} saved. Check the clause text against the signed source before publishing.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Template JSON is invalid or could not be saved.'); }
    finally { setBusy(false); }
  };

  const publishTemplate = async () => {
    if (!templateInfo?.version) { setError('Save a draft template before publishing.'); return; }
    setBusy(true); setError('');
    try {
      await apiClient.post(`/admin/agreements/template/${templateInfo.version}/publish`, {});
      await openTemplate(); setNotice(`Template v${templateInfo.version} published.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not publish the template.'); }
    finally { setBusy(false); }
  };

  const displayedFields = useMemo(() => Object.entries(detail?.fields ?? {}).filter(([path]) => {
    if (tab === 'parties') return path.startsWith('client.') || path.startsWith('patient.');
    return path.startsWith(`${tab}.`);
  }), [detail, tab]);

  const performResend = async (id: string) => {
    setBusy(true); setError('');
    try { await apiClient.post(`/admin/agreements/${id}/resend`, {}); await loadList(); setNotice('A new agreement link was issued.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not resend the agreement.'); }
    finally { setBusy(false); }
  };
  const performVoid = async (id: string) => {
    const reason = window.prompt('Reason for cancelling this agreement (required):');
    if (!reason?.trim()) return;
    setBusy(true); setError('');
    try { await apiClient.post(`/admin/agreements/${id}/void`, { reason }); await loadList(); if (selected === id) await loadDetail(id); setNotice('Agreement cancelled.'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not cancel the agreement.'); }
    finally { setBusy(false); }
  };

  const statusTone = (value: string) => value === 'completed' ? 'complete' : value === 'voided' || value === 'expired' ? 'closed' : value;

  const signaturePoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (event.currentTarget.width / rect.width), y: (event.clientY - rect.top) * (event.currentTarget.height / rect.height) };
  };
  const beginSignature = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const point = signaturePoint(event);
    context.beginPath(); context.moveTo(point.x, point.y); context.lineWidth = 2.5;
    context.lineCap = 'round'; context.lineJoin = 'round'; context.strokeStyle = '#163d2e';
    drawing.current = true; hasInk.current = true;
  };
  const moveSignature = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const point = signaturePoint(event); context.lineTo(point.x, point.y); context.stroke();
  };
  const clearSignature = () => {
    const canvas = signatureCanvas.current;
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
  };
  const countersign = async () => {
    if (!detail || !signatureCanvas.current || !hasInk.current || bloomwellName.trim().length < 2) {
      setError('Enter the authorised signatory name and draw the countersignature.'); return;
    }
    setBusy(true); setError('');
    try {
      await apiClient.post(`/admin/agreements/${detail.id}/countersign`, {
        name: bloomwellName.trim(), method: 'drawn', signature_base64: signatureCanvas.current.toDataURL('image/png'),
      });
      await loadDetail(detail.id); await loadList(); setNotice('Agreement countersigned and sealed.'); clearSignature();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not countersign this agreement.'); }
    finally { setBusy(false); }
  };
  const openSealedPdf = async () => {
    if (!detail) return;
    setBusy(true); setError('');
    try {
      const blob = await apiClient.getBlob(`/admin/agreements/${detail.id}/sealed-pdf`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${detail.reference}.pdf`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open the sealed agreement PDF.'); }
    finally { setBusy(false); }
  };
  const createAmendment = async () => {
    if (!detail) return;
    const variation_clause = window.prompt('Which clause number or named clause will this amendment vary?');
    if (!variation_clause?.trim()) return;
    setBusy(true); setError('');
    try {
      const result = await apiClient.post<AgreementDetail>(`/admin/agreements/${detail.id}/amend`, { variation_clause: variation_clause.trim() });
      await loadList(); setSelected(result.id); setTab('preview');
      setNotice(`Created amendment ${result.reference} for clause ${variation_clause.trim()}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create the amendment.'); }
    finally { setBusy(false); }
  };

  return (
    <div className={styles.page}>
      <PageHeader title="Agreements" subtitle="Online client agreements · Bloomwell Home Care Uganda Limited"
        actions={canWrite ? <Button onClick={create} disabled={busy}>New agreement</Button> : undefined} />
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      <div className={styles.layout}>
        <section className={styles.listPanel} aria-label="Agreement list">
          <div className={styles.filters}>
            {canWrite && <><label>Enquiry ID for next agreement (optional)<input value={sourceEnquiryId} onChange={(e) => setSourceEnquiryId(e.target.value)} placeholder="Paste enquiry ID" /></label><label>Assigned clinical nurse user ID (optional)<input value={assignedNurseId} onChange={(e) => setAssignedNurseId(e.target.value)} placeholder="Paste staff user ID" /></label></>}
            <label>Search<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Reference or client" /></label>
            <label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{['draft','sent','client_in_progress','client_signed','completed','changes_requested','expired','voided'].map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</select></label>
          </div>
          {rows.length === 0 ? <div className={styles.empty}><h2>No agreements yet</h2><p>Create an agreement from a client enquiry, review the staff-only care and fee sections, then send a secure link. Clients complete and sign in their browser.</p>{canWrite && <Button onClick={create} variant="outline">Create first agreement</Button>}</div> : (
            <ul className={styles.rows}>{rows.map((row) => <li key={row.id} className={selected === row.id ? styles.selected : ''}>
              <button type="button" className={styles.rowMain} onClick={() => { setSelected(row.id); setTab('parties'); }}>
                <strong>{row.reference}</strong><span>{row.client_name || 'Client not named'}</span><small>{row.patient_name ? `Patient: ${row.patient_name}` : 'Patient details pending'}</small>
                <StatusBadge status={statusTone(row.status)}>{row.status.replaceAll('_', ' ')}</StatusBadge>
              </button>
              {(canWrite || canVoid) && <div className={styles.rowActions}>{canWrite && <button type="button" onClick={() => void performResend(row.id)} disabled={busy || !['draft','sent','client_in_progress','changes_requested','expired'].includes(row.status)}>Resend</button>}{canVoid && <button type="button" onClick={() => void performVoid(row.id)} disabled={busy || row.status === 'completed' || row.status === 'voided'}>Void</button>}</div>}
            </li>)}</ul>
          )}
        </section>

        <section className={styles.editorPanel} aria-label="Agreement editor">
          {!selected || !detail ? <div className={styles.empty}><h2>Select an agreement</h2><p>Open an item from the list or create a new agreement.</p></div> : <>
            <div className={styles.editorHeading}><div><h2>{detail.reference}</h2><p>{detail.client_name || 'Client details pending'} · {detail.status.replaceAll('_', ' ')}</p></div><StatusBadge status={statusTone(detail.status)}>{detail.status.replaceAll('_', ' ')}</StatusBadge></div>
            <nav className={styles.tabs} aria-label="Agreement sections">{visibleTabs.map((entry) => <button type="button" key={entry.id} aria-current={tab === entry.id ? 'page' : undefined} onClick={() => { setTab(entry.id); if (entry.id === 'messages') void loadMessage(messageStage, messageChannel); if (entry.id === 'template') void openTemplate(); }}>{entry.label}</button>)}</nav>
            {(['parties','schedule_a','schedule_b','schedule_c'] as const).includes(tab as 'parties'|'schedule_a'|'schedule_b'|'schedule_c') && (
              <div className={styles.fields}>
                {displayedFields.map(([path, field]) => {
                  const local = drafts[path] ?? valueText(field.value);
                  const canClinical = user?.is_superadmin || detail.assigned_nurse_id === user?.id;
                  const readOnly = !canWrite || field.owner === 'client' || (field.owner === 'clinical' && !canClinical);
                  const conflict = conflicts[path];
                  return <div className={styles.field} key={path}>
                    <label htmlFor={`agreement-${path}`}><span>{label(path)}</span><small>Owner: {field.owner}{field.entered_by_staff ? ' · entered by staff' : ''} · Revision {field.revision}</small></label>
                    <textarea id={`agreement-${path}`} rows={2} value={local} readOnly={readOnly} onChange={(e) => setDrafts((old) => ({ ...old, [path]: e.target.value }))} />
                    {field.owner === 'either' && !readOnly && <label className={styles.check}><input type="checkbox" checked={enteredStaff[path] ?? field.entered_by_staff} onChange={(e) => setEnteredStaff((old) => ({ ...old, [path]: e.target.checked }))} /> Entered by staff on client's behalf</label>}
                    {!readOnly && <Button size="compact" variant="outline" onClick={() => void saveField(path)} disabled={busy || local === valueText(field.value)}>Save field</Button>}
                    {conflict && <div className={styles.conflict}><p><strong>Another saver updated this field.</strong><br />Current saved value: {conflict.remote || '—'}<br />Your unsaved value: {conflict.local || '—'}</p><Button size="compact" onClick={() => void saveField(path, { value: conflict.local, revision: conflict.revision })} disabled={busy}>Keep my value</Button><Button size="compact" variant="outline" onClick={() => { setDrafts((old) => ({ ...old, [path]: conflict.remote })); setConflicts((old) => { const next = { ...old }; delete next[path]; return next; }); }}>Use saved value</Button></div>}
                  </div>;
                })}
                {tab === 'schedule_b' && <div className={styles.feeBox}><strong>Live fee calculation</strong><pre>{JSON.stringify(detail.schedule_b_computed, null, 2)}</pre><small>The UGX 50,000 booking fee is additional to the service fees and excluded from the 50/50 advance/balance calculation, as required by clauses 8.2 and 8.4. USD service fees remain separate; no exchange rate is assumed.</small></div>}
              </div>
            )}
            {tab === 'preview' && <PreviewPanel id={detail.id} />}
            {tab === 'timeline' && <ol className={styles.timeline}>{detail.events.map((event, index) => <li key={`${event.type}-${event.at}-${index}`}><strong>{event.type.replaceAll('_', ' ')}</strong><time>{new Date(event.at).toLocaleString()}</time><small>{event.actor}</small><pre>{JSON.stringify(event.detail, null, 2)}</pre></li>)}</ol>}
            {tab === 'send' && <div className={styles.sendPanel}>
              {canWrite && <><h3>Send agreement for review</h3><p>Messages contain a secure link only. No patient name, care details or fees are sent by email or SMS.</p><label>Send via<select value={channels} onChange={(e) => setChannels(e.target.value as typeof channels)}><option value="both">Email and SMS</option><option value="email">Email only</option><option value="sms">SMS only</option></select></label><p>Link expiry: 14 days. Reminders: 48 hours and day 5. Expiry warning: 48 hours before expiry.</p><Button onClick={() => void send()} disabled={busy || !['draft','changes_requested','expired'].includes(detail.status)}>Validate and send</Button></>}
              {canSign && detail.status === 'client_signed' && <section className={styles.countersign}><h3>Bloomwell countersignature</h3><p>By countersigning, the system seals the agreement and stores its PDF in private storage.</p><label>Authorised signatory name<input value={bloomwellName} onChange={(e) => setBloomwellName(e.target.value)} /></label><canvas ref={signatureCanvas} className={styles.signaturePad} width={800} height={160} aria-label="Bloomwell countersignature area" onPointerDown={beginSignature} onPointerMove={moveSignature} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} /><div className={styles.actions}><Button variant="outline" onClick={clearSignature}>Clear signature</Button><Button onClick={() => void countersign()} disabled={busy}>Countersign and seal</Button></div></section>}
              {canWrite && detail.status === 'completed' && <div className={styles.actions}><Button variant="outline" onClick={() => void createAmendment()} disabled={busy}>Create amendment</Button><Button variant="outline" onClick={() => void openSealedPdf()} disabled={busy}>Download internal sealed PDF</Button></div>}
            </div>}
            {tab === 'messages' && <div className={styles.messagePanel}>
              <h3>Message templates</h3><div className={styles.filters}><label>Stage<select value={messageStage} onChange={(e) => { const next = e.target.value as MessageStage; void loadMessage(next, smsStages.has(next) ? messageChannel : 'email'); }}>{stages.map((s) => <option key={s} value={s}>{s}</option>)}</select></label><label>Channel<select value={messageChannel} onChange={(e) => void loadMessage(messageStage, e.target.value as 'email'|'sms')}><option value="email">Email</option><option value="sms" disabled={!smsStages.has(messageStage)}>SMS</option></select></label></div>
              {message && <><p>{message.is_default ? 'Using code default' : `Custom version ${message.version}`}</p>{messageChannel === 'email' && <label>Subject<input value={message.subject} onChange={(e) => setMessage({ ...message, subject: e.target.value })} /></label>}<label>Preheader<input value={message.preheader} onChange={(e) => setMessage({ ...message, preheader: e.target.value })} /></label><label>Message body<textarea rows={7} value={message.body} onChange={(e) => setMessage({ ...message, body: e.target.value })} /></label>{messageChannel === 'email' && <><label>Button label<input value={message.button} onChange={(e) => setMessage({ ...message, button: e.target.value })} /></label><label>Footer note<textarea rows={2} value={message.footer_note} onChange={(e) => setMessage({ ...message, footer_note: e.target.value })} /></label></>}<p>{messageChannel === 'sms' ? `${message.body.length} characters · ${message.body.length <= 160 ? 1 : message.body.length <= 306 ? 2 : 'over limit'} segments` : 'Email links are inserted by the shared branded layout.'}</p><div className={styles.actions}><Button onClick={() => void saveMessage()} disabled={busy}>Save message</Button><Button variant="outline" onClick={() => void previewMessage()} disabled={busy}>Preview</Button><Button variant="outline" onClick={() => void testSendMessage()} disabled={busy}>Send test to me</Button><Button variant="outline" onClick={() => void apiClient.post(`/admin/agreements/message-templates/${messageStage}/${messageChannel}/reset`, {}).then(() => loadMessage(messageStage, messageChannel))} disabled={busy}>Reset to default</Button></div>{messagePreview && <section className={styles.messagePreview}><h4>{messagePreview.subject ?? 'SMS preview'}</h4>{messagePreview.html ? <iframe title="Email message preview" srcDoc={messagePreview.html} sandbox="" /> : <p>{messagePreview.body}</p>}{messagePreview.gsm7 === false && <Notice tone="info">The rendered message contains characters outside GSM-7.</Notice>}{messagePreview.segments !== undefined && <small>{messagePreview.characters} characters · {messagePreview.segments} GSM-7 segment(s)</small>}</section>}</>}
            </div>}
            {tab === 'template' && <div className={styles.messagePanel}>
              <h3>Agreement clause versions</h3>
              {templateInfo?.versions?.length ? <label>Load version<select value={templateInfo.version ?? ''} onChange={(e) => void loadTemplateVersion(Number(e.target.value))}>{templateInfo.versions.map((version) => <option key={version.version} value={version.version}>v{version.version} · {version.published ? 'published' : 'draft'}{version.version === templateInfo.published_version ? ' · active' : ''}</option>)}</select></label> : null}
              {templateInfo && <p>Version {templateInfo.version ?? '—'} · {templateInfo.published ? 'published' : 'draft / not published'} · {templateInfo.template_hash ?? 'No template hash'}{templateInfo.source_file ? ` · Source: ${templateInfo.source_file}` : ''}</p>}
              <p>The source PDF is loaded as a versioned clause map. Review the complete wording and schedules against the original signed source before publishing. The two required company email corrections are checked server-side.</p>
              <textarea className={styles.templateEditor} rows={16} value={templateJson} onChange={(e) => setTemplateJson(e.target.value)} spellCheck={false} />
              <p>Publishing and voiding require the existing authenticator session. Verify your authenticator in Mail settings first; the session cookie is reused here.</p>
              <div className={styles.actions}><Button onClick={() => void saveTemplateDraft()} disabled={busy}>Save new draft version</Button><Button variant="outline" onClick={() => void publishTemplate()} disabled={busy || !templateInfo?.version || templateInfo.published}>Publish selected version</Button></div>
            </div>}
          </>}
        </section>
      </div>
      {canDiagnose && <AgreementDiagnostics canRunWorkflow={canSign} canSeedTemplate={canManageTemplates} />}
    </div>
  );
}

function PreviewPanel({ id }: { id: string }) {
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { let live = true; void apiClient.get<Preview>(`/admin/agreements/${id}/preview-data`).then((value) => { if (live) setHtml(value.html); }).catch((cause: unknown) => { if (live) setError(cause instanceof Error ? cause.message : 'Preview unavailable.'); }); return () => { live = false; }; }, [id]);
  if (error) return <Notice tone="error">{error}</Notice>;
  return <div className={styles.preview}><iframe title="Rendered client agreement preview" srcDoc={html} sandbox="" /></div>;
}
