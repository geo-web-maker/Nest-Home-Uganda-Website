import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Notice } from '@shared/components/dialogs/Notice';
import { Button } from '@shared/components/ui/Button';
import { ButtonGroup } from '@shared/components/dialogs/ButtonGroup';
import { FilterBar } from '../../../components/admin/FilterBar';
import { FilterTabs } from '../../../components/admin/FilterTabs';
import { Field } from '@shared/components/ui/Field';
import { StatusBadge } from '@shared/components/ui/Badge';
import { apiClient, ApiError } from '@shared/lib/api/client';
import { createPasskey, passkeysSupported, type PasskeyCreationOptions } from '@shared/lib/webauthn';
import { useAuth } from '../auth/useAuth';
import styles from './AgreementsPage.module.css';
import { AgreementCountersignPanel } from './AgreementCountersignPanel';
import { AgreementDeliveryPanel } from './AgreementDeliveryPanel';
import { AgreementLifecycleActions } from './AgreementLifecycleActions';
import { MessageTemplatePanel } from './MessageTemplatePanel';

import { dialogs } from '@shared/lib/dialogs';
import { useAgreementMessageTemplates } from './useAgreementMessageTemplates';
import { credentialProblem, type SignatureChoice } from '@shared/features/agreements/SignatureMethodPicker';
import { fieldLabel, isBlank, paymentOptionKind, type ScheduleTab } from '@shared/features/agreements/fieldMeta';
import { AgreementSchedulePanel } from './AgreementSchedulePanel';
import { AgreementLinkPanel } from './AgreementLinkPanel';
import { AgreementPreviewPanel } from './AgreementPreviewPanel';
import { AgreementTimeline } from './AgreementTimeline';
import type { AgreementField, FieldConflict } from './agreementFieldTypes';

type AgreementRow = {
  id: string; reference: string; status: string; client_name?: string | null; patient_name?: string | null;
  client_email?: string | null; client_phone?: string | null; assigned_nurse_id?: string | null;
  created_at: string; expires_at?: string | null; is_test?: boolean;
};
type AgreementDetail = AgreementRow & {
  template_version: number; template_hash: string; fields: Record<string, AgreementField>;
  schedule_b_computed: Record<string, string | number>; events: Array<{ type: string; at: string; actor: string; detail: Record<string, unknown> }>;
  sealed?: { sealed_at?: string; pdf_sha256?: string };
  link?: LinkInfo;
  fill_mode?: 'self' | 'assisted' | null;
  assistance?: { state: 'none' | 'requested' | 'ready'; requested_at?: string | null; ready_at?: string | null; note?: string | null };
};
type LinkInfo = {
  state: 'live' | 'legacy' | 'none';
  link_id: string | null;
  generation: number;
  url: string | null;
  expires_at: string | null;
  earlier_links_still_valid: number;
};
type AgreementList = { items: AgreementRow[]; total: number };
// Mirrors the server rule (the server enforces it): never sent, or already closed.
const DELETABLE_STATUSES = new Set(['draft', 'changes_requested', 'expired', 'voided']);

const tabs = [
  { id: 'parties', label: 'Parties' }, { id: 'schedule_a', label: 'Schedule A' },
  { id: 'schedule_b', label: 'Schedule B' }, { id: 'schedule_c', label: 'Schedule C' },
  { id: 'preview', label: 'Preview' }, { id: 'timeline', label: 'Timeline' },
  { id: 'send', label: 'Send' }, { id: 'messages', label: 'Messages' }, { id: 'template', label: 'Template versions' },
] as const;
type Tab = typeof tabs[number]['id'];

function label(path: string): string { return fieldLabel(path); }

/** The server names every field that blocked a send (ApiError.fields); list them so staff know what to fill in. */
function missingFieldsMessage(cause: unknown, fallback: string): string {
  if (!(cause instanceof Error)) return fallback;
  const paths = cause instanceof ApiError ? Object.keys(cause.fields) : [];
  if (paths.length === 0) return cause.message;
  const names = paths.map((path) => (path === 'client.phone or client.email' ? 'Client phone or email' : label(path)));
  const shown = names.slice(0, 6).join(', ');
  const more = names.length > 6 ? ` and ${names.length - 6} more` : '';
  return `${cause.message} Missing: ${shown}${more}.`;
}
function isScheduleTab(value: string): value is ScheduleTab {
  return ['parties', 'schedule_a', 'schedule_b', 'schedule_c'].includes(value);
}
function outstanding(fields: Record<string, AgreementField>, paths: string[]): string[] {
  const option = paymentOptionKind(valueText(fields['schedule_b.payment_option']?.value));
  return paths.filter((path) => {
    const field = fields[path];
    if (path === 'schedule_b.payment_option') return false; // blank means Standard 50/50
    if (path === 'schedule_b.payment_plan_details' && option === 'standard') return false;
    if ((path === 'schedule_b.advance_due_date' || path === 'schedule_b.balance_due_dates') && option !== 'standard') return false;
    return field !== undefined && (field.owner === 'staff' || field.owner === 'clinical') && isBlank(field.value);
  });
}
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
  const [showPractice, setShowPractice] = useState(false);
  const [sourceEnquiryId, setSourceEnquiryId] = useState('');
  const [assignedNurseId, setAssignedNurseId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [enteredStaff, setEnteredStaff] = useState<Record<string, boolean>>({});
  const [conflicts, setConflicts] = useState<Record<string, FieldConflict>>({});
  const [pick, setPick] = useState<{ email: boolean; sms: boolean }>({ email: true, sms: true });
  const channels = (pick.email && pick.sms ? 'both' : pick.email ? 'email' : pick.sms ? 'sms' : 'both') as 'email' | 'sms' | 'both';
  const noChannel = !pick.email && !pick.sms;
  const messageTemplates = useAgreementMessageTemplates({ setBusy, setError, setNotice });
  const {
    messageStage, messageChannel, message, messagePreview, templateJson, templateInfo,
    setMessage, setTemplateJson, loadMessage, changeMessageStage, changeMessageChannel, saveMessage,
    previewMessage, testSendMessage, resetMessage, openTemplate, installSourceTemplate,
    loadTemplateVersion, saveTemplateDraft, publishTemplate,
  } = messageTemplates;
  const [bloomwellName, setBloomwellName] = useState('');
  const signatureCanvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [signMethod, setSignMethod] = useState<SignatureChoice>('drawn');
  const [signPassword, setSignPassword] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  useEffect(() => { let live = true; void passkeysSupported().then((ok) => { if (live) setBiometricAvailable(ok); }); return () => { live = false; }; }, []);
  const canWrite = Boolean(user?.is_superadmin || user?.scopes.includes('agreements:write'));
  const canManageTemplates = Boolean(user?.is_superadmin || user?.scopes.includes('agreements:templates'));
  const canViewNotifications = Boolean(
    user?.is_superadmin ||
      user?.scopes.includes('agreements:notifications') ||
      user?.scopes.includes('agreements:templates'),
  );
  const canSign = Boolean(user?.is_superadmin || user?.scopes.includes('agreements:sign'));
  const canVoid = Boolean(user?.is_superadmin || user?.scopes.includes('agreements:void'));
  const visibleTabs = tabs.filter((entry) => entry.id === 'messages' ? canViewNotifications : entry.id === 'template' ? canManageTemplates : true);

  const loadList = useCallback(async () => {
    try {
      const result = await apiClient.get<AgreementList>('/admin/agreements', { params: { q: search, status, practice: showPractice ? 'true' : 'false' } });
      setRows(result.items);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load agreements.'); }
  }, [search, status, showPractice]);

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

  const create = async (practice = false) => {
    setBusy(true); setError('');
    try {
      if (practice) setShowPractice(true); else setShowPractice(false);
      const created = await apiClient.post<AgreementDetail>('/admin/agreements', {
        ...(practice ? { is_test: true } : {}),
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
        entered_by_staff: enteredStaff[path] ?? (current.owner === 'either' && detail.assistance?.state === 'requested' ? true : current.entered_by_staff),
      }] });
      await loadDetail(detail.id); await loadList(); setNotice(`${label(path)} saved.`);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) await loadDetail(detail.id).catch(() => undefined);
      setError(cause instanceof Error ? cause.message : 'The field could not be saved.');
    } finally { setBusy(false); }
  };

  const send = async () => {
    if (!detail) return;
    setBusy(true); setError('');
    try {
      const result = await apiClient.post<{ delivery: Record<string, boolean> }>(`/admin/agreements/${detail.id}/send`, { channels, expires_days: 14 });
      await loadDetail(detail.id); await loadList();
      const deliverySummary = Object.entries(result.delivery)
        .map(([channel, sent]) => `${channel} ${sent ? 'sent' : 'failed'}`)
        .join(', ');
      setNotice(`Agreement sent. Delivery: ${deliverySummary || 'none requested'}.`);
    } catch (cause) { setError(missingFieldsMessage(cause, 'The agreement could not be sent.')); }
    finally { setBusy(false); }
  };

  const displayedFields = useMemo(() => Object.entries(detail?.fields ?? {}).filter(([path]) => {
    if (tab === 'parties') return path.startsWith('client.') || path.startsWith('patient.');
    return path.startsWith(`${tab}.`);
  }), [detail, tab]);

  const performResend = async (id: string, via?: 'email' | 'sms' | 'both') => {
    const confirmed = await dialogs.confirm(
      'Send the client their agreement link again? It is the same link, so any earlier message still works.',
      { confirmLabel: 'Send again' },
    );
    if (!confirmed) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await apiClient.post<{ delivery: Record<string, boolean> }>(
        via ? `/admin/agreements/${id}/reissue-link?channels=${via}` : `/admin/agreements/${id}/resend`, {});
      await loadList(); if (selected === id) await loadDetail(id);
      const entries = Object.entries(result.delivery ?? {});
      const summary = entries.map(([k, v]) => `${k} ${v ? 'sent' : 'failed'}`).join(', ');
      if (entries.length > 0 && entries.every(([, ok]) => !ok)) {
        setError(`The new link could not be delivered (${summary}). The agreement is back to draft; check the client's contact details and send it again.`);
      } else {
        setNotice(`The agreement link was sent again. Delivery: ${summary || 'none requested'}.`);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not resend the agreement.'); }
    finally { setBusy(false); }
  };
  const markAssistanceReady = async () => {
    if (!detail) return;
    const confirmed = await dialogs.confirm(
      'Send the client a new link now? They will verify again, see the details you entered, and sign. Consent items in Schedule C stay theirs to complete.',
      { confirmLabel: 'Details are ready' },
    );
    if (!confirmed) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await apiClient.post<{ delivery: Record<string, boolean> }>(`/admin/agreements/${detail.id}/assistance/ready`, {});
      await loadList(); await loadDetail(detail.id);
      const summary = Object.entries(result.delivery ?? {}).map(([k, v]) => `${k} ${v ? 'sent' : 'failed'}`).join(', ');
      setNotice(`The client was sent their link to review and sign. Delivery: ${summary || 'none'}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The client could not be notified.'); }
    finally { setBusy(false); }
  };
  const performDeletePractice = async () => {
    const confirmed = await dialogs.confirm(
      'Delete ALL practice agreements and their files? Real agreements are not touched.',
      { confirmLabel: 'Delete all', danger: true },
    );
    if (!confirmed) return;
    setBusy(true); setError('');
    try {
      const result = await apiClient.delete<{ deleted: number }>('/admin/agreements/practice');
      setSelected('');
      setDetail(null);
      await loadList();
      setNotice(`${result?.deleted ?? 0} practice agreement(s) deleted.`);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete the practice agreements.'); }
    finally { setBusy(false); }
  };

  const performDelete = async (id: string, reference: string) => {
    const confirmed = await dialogs.confirm(
      `Permanently delete agreement ${reference}? This removes it and any stored files, and cannot be undone.`,
      { confirmLabel: 'Delete', danger: true },
    );
    if (!confirmed) return;
    setBusy(true); setError('');
    try {
      await apiClient.delete(`/admin/agreements/${id}`);
      if (selected === id) {
        setSelected('');
        setDetail(null);
      }
      await loadList();
      setNotice(`${reference} deleted.`);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete the agreement.'); }
    finally { setBusy(false); }
  };
  const performVoid = async (id: string) => {
    const reason = await dialogs.prompt(
      'Reason for cancelling this agreement (required):',
      '',
      { minLength: 3, multiline: true, confirmLabel: 'Cancel agreement', danger: true },
    );
    if (!reason?.trim()) return;
    setBusy(true); setError('');
    try {
      await apiClient.post(`/admin/agreements/${id}/void`, { reason });
      await loadList();
      if (selected === id) await loadDetail(id);
      setNotice('Agreement cancelled.');
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not cancel the agreement.'); }
    finally { setBusy(false); }
  };

  const statusTone = (value: string) => value === 'completed' ? 'complete' : value === 'voided' || value === 'expired' ? 'closed' : value;

  const signaturePoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (event.currentTarget.width / rect.width),
      y: (event.clientY - rect.top) * (event.currentTarget.height / rect.height),
    };
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
  const collectCountersignEvidence = async (agreementId: string): Promise<Record<string, unknown>> => {
    if (signMethod === 'password') return { method: 'password', password: signPassword };
    if (signMethod === 'biometric') {
      const challenge = await apiClient.post<{ options: PasskeyCreationOptions; challenge_token: string }>(
        `/admin/agreements/${agreementId}/countersign/passkey-options`, { name: bloomwellName.trim() });
      return { method: 'biometric', passkey: await createPasskey(challenge.options), challenge_token: challenge.challenge_token };
    }
    return { method: 'drawn', signature_base64: signatureCanvas.current?.toDataURL('image/png') };
  };
  const countersign = async () => {
    if (!detail || bloomwellName.trim().length < 2) { setError('Enter the authorised signatory name.'); return; }
    if (signMethod === 'drawn' && (!signatureCanvas.current || !hasInk.current)) { setError('Draw the countersignature.'); return; }
    const problem = credentialProblem(signMethod, 'staff', signPassword, '');
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try {
      const evidence = await collectCountersignEvidence(detail.id);
      await apiClient.post(`/admin/agreements/${detail.id}/countersign`, { name: bloomwellName.trim(), ...evidence });
      await loadDetail(detail.id); await loadList(); setNotice('Agreement countersigned and sealed.'); clearSignature();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not countersign this agreement.'); }
    finally { setBusy(false); setSignPassword(''); }
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
    const variation_clause = await dialogs.prompt(
      'Which clause number or named clause will this amendment vary?',
      '',
      { minLength: 1, confirmLabel: 'Create amendment' },
    );
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
      <PageHeader title="Agreements"
        actions={canWrite ? <div className={styles.actionRow}>
          <Button onClick={() => void create()} disabled={busy}>New agreement</Button>
          <Button variant="outline" onClick={() => void create(true)} disabled={busy}>New practice agreement</Button>
          <FilterTabs
            label="Agreements to show"
            value={showPractice ? 'practice' : 'real'}
            className={styles.modeSwitch}
            tabs={[{ value: 'real', label: 'Real' }, { value: 'practice', label: 'Practice' }]}
            onChange={(value) => { setShowPractice(value === 'practice'); setSelected(null); }}
          />
        </div> : undefined} />
      {error && <Notice tone="error" floating onDismiss={() => setError('')}>{error}</Notice>}
      {notice && <Notice tone="success" floating onDismiss={() => setNotice('')}>{notice}</Notice>}
      <div className={styles.layout}>
        <section className={styles.listPanel} aria-label="Agreement list">
          <FilterBar label="Agreement filters">
            {canWrite && <>
              <Field
                label="Enquiry ID for next agreement (optional)"
                value={sourceEnquiryId}
                onChange={(event) => setSourceEnquiryId(event.target.value)}
                placeholder="Paste enquiry ID"
              />
              <Field
                label="Assigned clinical nurse user ID (optional)"
                value={assignedNurseId}
                onChange={(event) => setAssignedNurseId(event.target.value)}
                placeholder="Paste staff user ID"
              />
            </>}
            <Field label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Reference or client" />
            <Field kind="select" label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {['draft', 'sent', 'client_in_progress', 'client_signed', 'completed', 'changes_requested', 'expired', 'voided'].map((value) => (
                <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>
              ))}
            </Field>
          </FilterBar>
          {canVoid && showPractice && (
            <div className={styles.practiceBar}>
              <span>Showing practice agreements</span>
              <Button
                variant="danger-outline"
                size="compact"
                onClick={() => void performDeletePractice()}
                disabled={busy}
              >
                Delete all practice
              </Button>
            </div>
          )}
          {rows.length === 0 ? (
            <div className={styles.empty}>
              <h2>No agreements yet</h2>
              <p>
                Create an agreement from a client enquiry, review the staff-only care and fee sections, then send a secure link.
                Clients complete and sign in their browser.
              </p>
              {canWrite && (
                <Button onClick={() => void create()} variant="outline">
                  Create first agreement
                </Button>
              )}
            </div>
          ) : (
            <ul className={styles.rows}>{rows.map((row) => <li key={row.id} className={selected === row.id ? styles.selected : ''}>
              <Button type="button" variant="outline" size="compact" className={styles.rowMain} onClick={() => { setSelected(row.id); setTab('parties'); }}>
                <strong>{row.reference}{row.is_test ? ' (PRACTICE)' : ''}</strong>
                <span>{row.client_name || 'Client not named'}</span>
                <small>{row.patient_name ? `Patient: ${row.patient_name}` : 'Patient details pending'}</small>
                <StatusBadge status={statusTone(row.status)}>{row.status.replaceAll('_', ' ')}</StatusBadge>
              </Button>
              {(canWrite || canVoid) && (
                <ButtonGroup size="compact" align="end">
                  {canWrite && (
                    <Button
                      variant="outline"
                      onClick={() => void performResend(row.id)}
                      disabled={busy || !['draft', 'sent', 'client_in_progress', 'changes_requested', 'expired'].includes(row.status)}
                    >
                      Resend
                    </Button>
                  )}
                  {canVoid && (
                    <Button
                      variant="danger-outline"
                      onClick={() => void performVoid(row.id)}
                      disabled={busy || row.status === 'completed' || row.status === 'voided'}
                    >
                      Void
                    </Button>
                  )}
                  {canVoid && (DELETABLE_STATUSES.has(row.status) || row.is_test) && (
                    <Button variant="danger-outline" onClick={() => void performDelete(row.id, row.reference)} disabled={busy}>
                      Delete
                    </Button>
                  )}
                </ButtonGroup>
              )}
            </li>)}</ul>
          )}
        </section>

        <section className={styles.editorPanel} aria-label="Agreement editor">
          {!selected || !detail ? (
            <div className={styles.empty}>
              <h2>Select an agreement</h2>
              <p>Open an item from the list or create a new agreement.</p>
            </div>
          ) : <>
            <div className={styles.editorHeading}>
              <div>
                <h2>{detail.reference}</h2>
                <p>{detail.client_name || 'Client details pending'} · {detail.status.replaceAll('_', ' ')}</p>
              </div>
              <StatusBadge status={statusTone(detail.status)}>{detail.status.replaceAll('_', ' ')}</StatusBadge>
            </div>
            {detail.assistance?.state === 'requested' && (
              <Notice tone="info">
                <strong>The client asked you to fill this in for them.</strong>
                {detail.assistance.note ? <> Their note: “{detail.assistance.note}”.</> : null}
                {' '}
                Complete the details in the tabs below (fields entered here are marked as entered by
                staff), then press the button. The client is messaged once, when you press it, not
                after each save. Schedule C consent items cannot be entered by staff; the client
                completes those when they review.
                {canWrite && (
                  <Button size="compact" onClick={() => void markAssistanceReady()} disabled={busy}>
                    Details are ready: notify client
                  </Button>
                )}
              </Notice>
            )}
            {detail.assistance?.state === 'ready' && ['sent', 'client_in_progress'].includes(detail.status) && (
              <Notice tone="info">
                Details were completed by staff
                {detail.assistance.ready_at ? ` on ${new Date(detail.assistance.ready_at).toLocaleString()}` : ''}.
                {' '}Waiting for the client to review and sign.
              </Notice>
            )}
            <FilterTabs label="Agreement sections" value={tab}
              tabs={visibleTabs.map((entry) => {
                const sectionPaths = Object.keys(detail.fields).filter((path) =>
                  path.startsWith(entry.id === 'parties' ? 'client.' : `${entry.id}.`) ||
                  (entry.id === 'parties' && path.startsWith('patient.')),
                );
                const count = isScheduleTab(entry.id)
                  ? outstanding(detail.fields, sectionPaths).length
                  : 0;
                return { value: entry.id, label: count ? `${entry.label} (${count})` : entry.label };
              })}
              onChange={(value) => {
                setTab(value as typeof tab);
                if (value === 'messages') void loadMessage(messageStage, messageChannel);
                if (value === 'template') void openTemplate();
              }}
            />
            <div className={styles.editorBody}>
            {isScheduleTab(tab) && (
              <AgreementSchedulePanel
                detail={detail}
                tab={tab}
                displayedFields={displayedFields}
                drafts={drafts}
                conflicts={conflicts}
                enteredStaff={enteredStaff}
                canWrite={canWrite}
                busy={busy}
                onDraftChange={(path, value) => setDrafts((old) => ({ ...old, [path]: value }))}
                onSaveField={(path, override) => void saveField(path, override)}
                onEnteredByStaffChange={(path, checked) =>
                  setEnteredStaff((old) => ({ ...old, [path]: checked }))
                }
                onClearConflict={(path) => setConflicts((old) => {
                  const next = { ...old };
                  delete next[path];
                  return next;
                })}
              />
            )}
            {tab === 'preview' && <AgreementPreviewPanel id={detail.id} reference={detail.reference} />}
            {tab === 'timeline' && <AgreementTimeline events={detail.events} />}
            {tab === 'send' && detail && (
              <div className={styles.sendPanel}>
                <AgreementDeliveryPanel
                  status={detail.status}
                  canWrite={canWrite}
                  busy={busy}
                  noChannel={noChannel}
                  channels={pick}
                  onChannelsChange={setPick}
                  onSend={() => void send()}
                  resendPanel={
                    <AgreementLinkPanel
                      id={detail.id}
                      link={detail.link}
                      onChanged={() => void loadDetail(detail.id)}
                      resend={
                        <Button
                          variant="outline"
                          onClick={() => void performResend(detail.id, channels)}
                          disabled={busy || noChannel}
                        >
                          Resend link
                        </Button>
                      }
                    />
                  }
                />
                <AgreementCountersignPanel
                  canSign={canSign}
                  status={detail.status}
                  busy={busy}
                  signatoryName={bloomwellName}
                  onSignatoryNameChange={setBloomwellName}
                  method={signMethod}
                  onMethodChange={(next) => {
                    setSignMethod(next);
                    setError('');
                  }}
                  biometricAvailable={biometricAvailable}
                  password={signPassword}
                  onPasswordChange={setSignPassword}
                  signatureCanvas={signatureCanvas}
                  onBeginSignature={beginSignature}
                  onMoveSignature={moveSignature}
                  onEndSignature={() => {
                    drawing.current = false;
                  }}
                  onClearSignature={clearSignature}
                  onCountersign={() => void countersign()}
                />
                <AgreementLifecycleActions
                  status={detail.status}
                  isTest={detail.is_test}
                  canWrite={canWrite}
                  canVoid={canVoid}
                  busy={busy}
                  onDelete={() => void performDelete(detail.id, detail.reference)}
                  onCreateAmendment={() => void createAmendment()}
                  onOpenSealedPdf={() => void openSealedPdf()}
                />
              </div>
            )}
            {(tab === 'messages' || tab === 'template') && (
              <MessageTemplatePanel
                tab={tab}
                messageStage={messageStage}
                messageChannel={messageChannel}
                message={message}
                messagePreview={messagePreview}
                onMessageStageChange={changeMessageStage}
                onMessageChannelChange={(channel) => void changeMessageChannel(channel)}
                onMessageChange={setMessage}
                onSaveMessage={() => void saveMessage()}
                onPreviewMessage={() => void previewMessage()}
                onTestSendMessage={() => void testSendMessage()}
                onResetMessage={() => void resetMessage()}
                templateInfo={templateInfo}
                templateJson={templateJson}
                onTemplateJsonChange={setTemplateJson}
                onLoadTemplateVersion={(version) => void loadTemplateVersion(version)}
                canManageTemplates={canManageTemplates}
                onInstallSourceTemplate={() => void installSourceTemplate()}
                onSaveTemplateDraft={() => void saveTemplateDraft()}
                onPublishTemplate={() => void publishTemplate()}
                busy={busy}
              />
            )}
            </div>
          </>}
        </section>
      </div>
    </div>
  );
}
