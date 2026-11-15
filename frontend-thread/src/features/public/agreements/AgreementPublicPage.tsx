import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useParams } from 'react-router-dom';
import { API_PREFIX, ApiError, apiClient } from '../../../lib/api/client';
import { Button } from '../../../components/ui/Button';
import { Checkbox } from '../../../components/ui/Checkbox';
import { Field } from '../../../components/ui/Field';
import { createPasskey, passkeysSupported, type PasskeyCreationOptions } from '../../../lib/webauthn';
import { AgreementFieldInput } from '../../agreements/AgreementFieldInput';
import { SCHEDULE_SECTIONS, fieldLabel as metaLabel, fieldMeta, isHiddenField } from '../../agreements/fieldMeta';
import { SignatureMethodPicker, credentialProblem, signatureMethodLabel, type SignatureChoice } from '../../agreements/SignatureMethodPicker';
import { AgreementProblem } from './AgreementProblem';
import { AgreementShell } from './AgreementShell';
import { ContractReader } from './ContractReader';
import { describeLinkFailure, loadWithRetry } from './linkFailure';
import styles from './AgreementPublicPage.module.css';

type AgreementField = { value: unknown; owner: 'staff' | 'clinical' | 'client' | 'either'; revision: number; entered_by_staff: boolean };
type Assistance = { state: 'none' | 'requested' | 'ready'; requested_at?: string | null; ready_at?: string | null };
type PublicAgreement = {
  is_test?: boolean;
  company: string; reference: string; status: string; template_version: number;
  clauses: Record<string, string>; document_html?: string | null; fields: Record<string, AgreementField>;
  schedule_b_computed: Record<string, string | number>; content_hash: string;
  signed: boolean; variation_clause?: string | null; parent_reference?: string | null;
  /** How the client chose to fill the form in, and where a request for help stands. Absent on older servers. */
  fill_mode?: 'self' | 'assisted' | null; assistance?: Assistance;
  signatures?: Array<{ role: string; name: string; method: string; signed_at: string }>;
  certificate?: PublicCertificate | null; pdf_available?: boolean;
};
type PublicCertificate = {
  practice?: boolean; reference?: string | null; client?: string | null; patient?: string | null;
  client_signed_at?: string | null; countersigned_at?: string | null; sealed_at?: string | null; content_hash?: string | null;
  signers: Array<{ role: string; name: string; method: string; signed_at: string; code_verified_at?: string | null }>;
};
const when = (value?: string | null) => (value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');
type PreOtp = { link_id?: string; release?: string; company: string; message: string; phone_hint?: string | null; email_hint?: string | null; available_channels: { sms: boolean; email: boolean }; purpose: 'sign' | 'view' };
type OtpSent = { message: string; destination_hint: string; channel?: 'sms' | 'email'; resend_after?: number; expires_in?: number };
const RESEND_FALLBACK_SECONDS = 60;
const PHONE = '0787499988';
const clock = (total: number) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
type TurnstileApi = {
  render: (container: HTMLElement, options: {
    sitekey: string; callback: (token: string) => void;
    'expired-callback'?: () => void; 'error-callback'?: () => void;
  }) => string;
  remove?: (widgetId: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

function fieldLabel(path: string): string { return metaLabel(path); }
function toText(value: unknown): string { return value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value, null, 2); }

type SaveState = 'saving' | 'saved' | 'error';

/** Per-field save indicator shown beside each field the client can edit. */
function SaveStatus({ state, dirty, onRetry }: { state?: SaveState; dirty: boolean; onRetry: () => void }) {
  const shown = state ?? (dirty ? 'unsaved' : 'idle');
  return (
    <span className={styles.saveState} data-state={shown} aria-live="polite">
      {shown === 'saving' && 'Saving…'}
      {shown === 'saved' && '✓ Saved'}
      {shown === 'unsaved' && 'Unsaved changes'}
      {shown === 'error' && <>Not saved. <button type="button" onClick={onRetry}>Retry</button></>}
      {shown === 'idle' && 'Your field'}
    </span>
  );
}

// Keep identical to ESIGN_CONSENT_TEXT in the backend agreements service (the server stores its own copy).
const ESIGN_CONSENT_TEXT = 'I agree to sign this agreement electronically. I understand that my electronic signature has the same effect as a handwritten signature.';

const iconProps = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, focusable: false };
const PencilIcon = () => <svg {...iconProps}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></svg>;
const HelpIcon = () => <svg {...iconProps}><path d="M8 11V6.5a1.5 1.5 0 0 1 3 0V11" /><path d="M11 10V4.5a1.5 1.5 0 0 1 3 0V10" /><path d="M14 10V6.5a1.5 1.5 0 0 1 3 0V13a6 6 0 0 1-6 6h-.5A5.5 5.5 0 0 1 6 13.5V11a1.5 1.5 0 0 1 3 0" /></svg>;

/** Stepper above the card title: verify, details, then review and sign. */
function Steps({ current }: { current: 0 | 1 | 2 | 3 }) {
  const items = ['Verify it is you', 'Your details', 'Review and sign'];
  return (
    <ol className={styles.stepper} aria-label="Progress">
      {items.map((label, index) => (
        <li key={label} data-state={index < current ? 'done' : undefined} aria-current={index === current ? 'step' : undefined}>
          <span aria-hidden="true">{index < current ? '✓' : index + 1}</span>{label}
        </li>
      ))}
    </ol>
  );
}

function AgreementPublicPageInner() {
  const { token = '' } = useParams();
  const [pre, setPre] = useState<PreOtp | null>(null);
  const [view, setView] = useState<PublicAgreement | null>(null);
  const [step, setStep] = useState<'verify' | 'review' | 'signed'>('verify');
  const [channel, setChannel] = useState<'sms' | 'email'>('sms');
  const [code, setCode] = useState('');
  const [delivery, setDelivery] = useState<OtpSent | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [tick, setTick] = useState(() => Date.now());
  const codeInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const [changeRequested, setChangeRequested] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [changeReason, setChangeReason] = useState('');
  const [assistOpen, setAssistOpen] = useState(false);
  const [assistNote, setAssistNote] = useState('');
  const [sessionReplaced, setSessionReplaced] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const signatureCanvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [method, setMethod] = useState<SignatureChoice>('drawn');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [esignConsent, setEsignConsent] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const viewRef = useRef<PublicAgreement | null>(null);
  const draftsRef = useRef<Record<string, string>>({});
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  draftsRef.current = drafts;
  // Resend countdown. Derived from an end time, so it stays right if the tab sleeps.
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setTick(now);
      if (now >= cooldownUntil) window.clearInterval(id);
    }, 500);
    setTick(Date.now());
    return () => window.clearInterval(id);
  }, [cooldownUntil]);
  const secondsLeft = Math.max(0, Math.ceil((cooldownUntil - tick) / 1000));
  const cooldownTotal = delivery?.resend_after ?? RESEND_FALLBACK_SECONDS;
  useEffect(() => { let live = true; void passkeysSupported().then((ok) => { if (live) setBiometricAvailable(ok); }); return () => { live = false; }; }, []);

  const loadReview = useCallback(async (purpose: 'sign' | 'view') => {
    const endpoint = purpose === 'view' ? '/public/agreements/session/signed' : '/public/agreements/session';
    const result = await apiClient.get<PublicAgreement>(endpoint);
    viewRef.current = result;
    setView(result);
    setDrafts(Object.fromEntries(Object.entries(result.fields).map(([path, field]) => [path, toText(field.value)])));
    setStep(purpose === 'view' ? 'signed' : 'review');
  }, []);

  useEffect(() => {
    let active = true;
    void loadWithRetry(() => apiClient.get<PreOtp>(`/public/agreements/${encodeURIComponent(token)}`)).then(async (result) => {
      if (!active) return;
      setPre(result);
      setChannel(result.available_channels.sms ? 'sms' : 'email');
      try { await loadReview(result.purpose); } catch { /* No valid OTP session yet. */ }
    }).catch((cause: unknown) => {
      if (active) { setLoadError(cause); setError(cause instanceof Error ? cause.message : 'This agreement link could not be opened.'); }
    });
    return () => { active = false; };
  }, [token, loadReview]);

  useEffect(() => {
    if (!pre || !turnstileSiteKey || !turnstileRef.current) return;
    let disposed = false;
    let widgetId: string | undefined;
    const renderWidget = () => {
      if (disposed || !window.turnstile || !turnstileRef.current || widgetId) return;
      widgetId = window.turnstile.render(turnstileRef.current, {
        sitekey: turnstileSiteKey,
        callback: (value) => setTurnstileToken(value),
        'expired-callback': () => setTurnstileToken(''),
        'error-callback': () => setTurnstileToken(''),
      });
    };
    let script = document.querySelector<HTMLScriptElement>('script[data-bloomwell-turnstile]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.bloomwellTurnstile = 'true';
      document.head.appendChild(script);
    }
    script.addEventListener('load', renderWidget);
    renderWidget();
    return () => {
      disposed = true;
      script?.removeEventListener('load', renderWidget);
      if (widgetId) window.turnstile?.remove?.(widgetId);
      setTurnstileToken('');
    };
  }, [pre, turnstileSiteKey]);

  const requestCode = async () => {
    if (!pre || secondsLeft > 0) return;
    setBusy(true); setError(''); setNotice(''); setCode('');
    try {
      const suffix = pre.purpose === 'view' ? 'request-view' : 'request';
      const sent = await apiClient.post<OtpSent>(`/public/agreements/${encodeURIComponent(token)}/otp/${suffix}`, {
        channel, ...(turnstileToken ? { turnstile_token: turnstileToken } : {}),
      });
      const sentChannel = sent.channel ?? channel;
      setDelivery({ ...sent, channel: sentChannel });
      setNotice(sent.message);
      setCooldownUntil(Date.now() + (sent.resend_after ?? RESEND_FALLBACK_SECONDS) * 1000);
      window.setTimeout(() => codeInput.current?.focus(), 50);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'otp_cooldown') {
        // Another request was made moments ago (for example before a refresh): resume that countdown.
        const wait = Number(cause.fields.retry_after) || RESEND_FALLBACK_SECONDS;
        setCooldownUntil(Date.now() + wait * 1000);
        setDelivery((old) => old ?? { message: '', destination_hint: '', channel, resend_after: RESEND_FALLBACK_SECONDS });
        setError('');
        setNotice('A code was sent a moment ago. Please check your messages, then enter it below.');
      } else {
        setError(cause instanceof Error ? cause.message : 'The verification code could not be sent.');
      }
    } finally { setBusy(false); }
  };

  /** Downloads the ready-made sealed PDF (agreement, signatures and certificate) kept by Bloomwell. */
  const downloadSignedPdf = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch(`${API_PREFIX}/public/agreements/session/signed/pdf`, { credentials: 'include' });
      if (!response.ok) throw new Error(response.status === 403 ? 'Your session has expired. Please verify again to download the PDF.' : `The signed PDF is not available right now. Please try again, or call ${PHONE}.`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `${view?.reference ?? 'agreement'}-signed.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The signed PDF could not be downloaded.'); }
    finally { setBusy(false); }
  };

  const verifyCode = async (entered: string = code) => {
    if (!pre || busy) return;
    setBusy(true); setError('');
    try {
      const suffix = pre.purpose === 'view' ? 'verify-view' : 'verify';
      await apiClient.post(`/public/agreements/${encodeURIComponent(token)}/otp/${suffix}`, { code: entered });
      await loadReview(pre.purpose); setNotice(pre.purpose === 'view' ? 'Your signed agreement is verified.' : 'You are verified. Read your agreement, then choose how to fill in your details.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'That code could not be verified.'); }
    finally { setBusy(false); }
  };

  /** Editable fields whose typed value differs from what the server holds. */
  const dirtyChanges = () => {
    const current = viewRef.current;
    if (!current) return [];
    return Object.entries(draftsRef.current).flatMap(([path, value]) => {
      const field = current.fields[path];
      if (!field || !['client', 'either'].includes(field.owner) || value === toText(field.value)) return [];
      return [{ path, value, expected_revision: field.revision, entered_by_staff: false }];
    });
  };

  const markSaves = (paths: string[], state: SaveState | null) => setSaveState((old) => {
    const next = { ...old };
    for (const path of paths) { if (state) next[path] = state; else delete next[path]; }
    return next;
  });

  /** Saves every unsaved edit in one request, one save at a time. Resolves to the latest agreement, or null if a save failed. */
  const flushDrafts = useCallback((): Promise<PublicAgreement | null> => {
    const run = async (): Promise<PublicAgreement | null> => {
      const changes = dirtyChanges();
      if (!changes.length) return viewRef.current;
      const paths = changes.map((change) => change.path);
      markSaves(paths, 'saving');
      try {
        const updated = await apiClient.patch<PublicAgreement>('/public/agreements/session/fields', { changes });
        viewRef.current = updated;
        setView(updated);
        setError('');
        markSaves(paths, 'saved');
        window.setTimeout(() => setSaveState((old) => {
          const next = { ...old };
          for (const path of paths) if (next[path] === 'saved') delete next[path];
          return next;
        }), 3000);
        return updated;
      } catch (cause) {
        if (cause instanceof Error && 'status' in cause && (cause as { status: number }).status === 409) {
          markSaves(paths, null);
          try {
            await loadReview('sign');
            setError('Someone updated this agreement while you were editing. The latest saved version is now shown; please review it and re-enter any change.');
          } catch { setError('This review session expired. Verify again to continue.'); }
        } else {
          markSaves(paths, 'error');
          setError(cause instanceof Error ? cause.message : 'Some changes could not be saved.');
        }
        return null;
      }
    };
    const next = saveQueue.current.then(run, run);
    saveQueue.current = next;
    return next;
  }, [loadReview]);

  /** Called when the client leaves a field: save straight away. */
  const saveField = (path: string, value: string) => {
    draftsRef.current = { ...draftsRef.current, [path]: value };
    void flushDrafts();
  };

  // Autosave shortly after typing stops, so nothing relies on the client leaving the field.
  useEffect(() => {
    if (step !== 'review') return undefined;
    const timer = window.setTimeout(() => { if (dirtyChanges().length) void flushDrafts(); }, 1200);
    return () => window.clearTimeout(timer);
    // dirtyChanges reads refs only, so it is stable.
  }, [drafts, step, flushDrafts]);

  // Warn before the page is closed with unsaved or in-flight changes.
  useEffect(() => {
    if (step !== 'review') return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      if (dirtyChanges().length || Object.values(saveState).includes('saving')) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [step, saveState]);

  /** Records how the client wants to complete the form. "assisted" tells Bloomwell staff to fill it in for them. */
  const chooseMode = async (mode: 'self' | 'assisted', note?: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const updated = await apiClient.post<PublicAgreement>('/public/agreements/session/fill-mode', {
        mode, ...(note?.trim() ? { note: note.trim() } : {}),
      });
      viewRef.current = updated;
      setView(updated);
      setAssistOpen(false);
      setNotice(mode === 'assisted'
        ? 'Request sent. A Bloomwell team member will fill in your details and message you a link to review and sign.'
        : 'Fill in your details below. Everything you type is saved as you go.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your choice could not be saved. Please try again.'); }
    finally { setBusy(false); }
  };

  /** Used on the waiting screen: has Bloomwell finished? When they have, the old session is replaced by a new link. */
  const checkAgain = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      await loadReview('sign');
      setNotice('Still waiting for Bloomwell to finish your details.');
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 409)) setSessionReplaced(true);
      else setError(cause instanceof Error ? cause.message : 'We could not check right now. Please try again.');
    } finally { setBusy(false); }
  };

  const pointerPosition = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (event.currentTarget.width / rect.width), y: (event.clientY - rect.top) * (event.currentTarget.height / rect.height) };
  };
  const beginStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    const context = canvas.getContext('2d');
    if (!context) return;
    const point = pointerPosition(event);
    context.beginPath(); context.moveTo(point.x, point.y);
    context.lineWidth = 2.5; context.lineCap = 'round'; context.lineJoin = 'round'; context.strokeStyle = '#0B2E2A';
    drawing.current = true; hasInk.current = true;
  };
  const drawStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const point = pointerPosition(event);
    context.lineTo(point.x, point.y); context.stroke();
  };
  const endStroke = () => { drawing.current = false; };
  const clearSignature = () => {
    const canvas = signatureCanvas.current;
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
  };

  const collectEvidence = async (): Promise<Record<string, unknown>> => {
    if (method === 'password') return { method: 'password', password };
    if (method === 'biometric') {
      const challenge = await apiClient.post<{ options: PasskeyCreationOptions; challenge_token: string }>(
        '/public/agreements/session/sign/passkey-options', { name: name.trim() });
      return { method: 'biometric', passkey: await createPasskey(challenge.options), challenge_token: challenge.challenge_token };
    }
    return { method: 'drawn', signature_base64: signatureCanvas.current?.toDataURL('image/png') };
  };

  const sign = async () => {
    if (!view || name.trim().length < 2) { setError('Enter your full name before submitting.'); return; }
    if (!esignConsent) { setError('Tick the box to agree to sign electronically before submitting.'); return; }
    if (method === 'drawn' && (!signatureCanvas.current || !hasInk.current)) { setError('Draw your signature in the box before submitting.'); return; }
    const problem = credentialProblem(method, 'client', password, confirmPassword);
    if (problem) { setError(problem); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const fresh = await flushDrafts(); // save anything still unsaved, and sign the version the server now holds
      if (!fresh) { setError((prev) => prev || 'Some of your answers could not be saved. Please check the marked fields and try again.'); return; }
      const evidence = await collectEvidence();
      const result = await apiClient.post<{ signed: boolean }>('/public/agreements/session/sign', {
        name: name.trim(), role: 'client', expected_content_hash: fresh.content_hash, esign_consent: true, ...evidence,
      });
      if (result.signed) { setStep('signed'); setNotice('Your signature has been received. Bloomwell will countersign and send confirmation.'); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your signature could not be recorded.'); }
    finally { setBusy(false); setPassword(''); setConfirmPassword(''); }
  };

  const sendChangeRequest = async () => {
    const reason = changeReason.trim();
    if (reason.length < 5) { setError('Tell Bloomwell what you would like changed (at least a few words).'); return; }
    setBusy(true); setError('');
    try {
      const result = await apiClient.post<{ message: string }>('/public/agreements/session/request-change', { reason });
      setNotice(result.message); setChangeRequested(true); setChangeOpen(false); setStep('signed');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your request could not be sent.'); }
    finally { setBusy(false); }
  };

  if (error && !pre) {
    const failure = describeLinkFailure(loadError);
    return <AgreementProblem failure={failure} />;
  }

  // What the client sees in the details column, from the server's record of their choice.
  const assistance = view?.assistance?.state ?? 'none';
  const hasClientFields = view ? Object.entries(view.fields).some(([path, field]) => ['client', 'either'].includes(field.owner) && !isHiddenField(path)) : false;
  const choosing = step === 'review' && hasClientFields && !view?.fill_mode && assistance === 'none';
  const waiting = step === 'review' && assistance === 'requested';
  const formOpen = step === 'review' && !choosing && !waiting;
  const stage: 0 | 1 | 2 | 3 = step === 'verify' ? 0 : step === 'signed' ? 3 : formOpen ? 2 : 1;

  const title = step === 'verify' ? (pre?.purpose === 'view' ? 'View your signed agreement' : 'Review your care agreement')
    : step === 'review' ? 'Your care agreement' : pre?.purpose === 'view' ? 'Signed agreement' : changeRequested ? 'Change requested' : 'Thank you';

  return <AgreementShell subtitle="Client care agreement" wide={step !== 'verify'}>
    <section className={styles.card} aria-labelledby="agreement-title">
      <p className={styles.eyebrow}>Bloomwell Home Care Uganda Limited</p>
      <h1 id="agreement-title">{title}</h1>
      {pre && <p className={styles.reference}>Reference: {view?.reference ?? 'Verify to continue'}</p>}
      {pre?.purpose !== 'view' && step !== 'signed' && <Steps current={stage} />}
      {error && <div className={styles.error} role="alert" style={{ marginTop: 'var(--space-md)' }}>{error}</div>}
      {notice && <div className={styles.notice} role="status" style={{ marginTop: 'var(--space-md)' }}>{notice}</div>}

      {step === 'verify' && pre && <div className={styles.verify}>
        <p>For your privacy, we will send a short verification code to the contact already recorded on your agreement. No agreement details are shown until you verify.</p>
        <div className={styles.contactHint}>{pre.phone_hint && <span>Phone: {pre.phone_hint}</span>}{pre.email_hint && <span>Email: {pre.email_hint}</span>}</div>
        {!delivery && <Field kind="select" label="Send code by" value={channel} onChange={(e) => setChannel(e.target.value as 'sms' | 'email')}><option value="sms" disabled={!pre.available_channels.sms}>SMS</option><option value="email" disabled={!pre.available_channels.email}>Email</option></Field>}
        {!pre.available_channels.sms && !pre.available_channels.email && <p className={styles.security}>Bloomwell cannot currently send a verification code to this agreement's recorded contacts. No agreement details are displayed. Please call {PHONE} for assistance.</p>}
        {turnstileSiteKey && <div className={styles.turnstile} ref={turnstileRef} aria-label="Security verification" />}
        {!delivery && <Button onClick={() => void requestCode()} disabled={busy || (!pre.available_channels.sms && !pre.available_channels.email) || !pre.available_channels[channel] || Boolean(turnstileSiteKey && !turnstileToken)} aria-busy={busy || undefined}>Send verification code</Button>}
        {delivery && <div className={styles.otpPanel}>
          <p className={styles.otpWait}>
            <strong>Your code is on its way{delivery.destination_hint ? ` to ${delivery.destination_hint}` : ''}.</strong>
            {' '}{delivery.channel === 'email' ? 'Email can take a minute or two. If you do not see it, check your spam or junk folder.' : 'SMS can take up to a minute to arrive, depending on your network.'}
          </p>
          <label className={styles.plain}>Six-digit verification code
            <input ref={codeInput} className={styles.otpInput} value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" aria-describedby="otp-resend"
              onChange={(e) => { const next = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(next); if (next.length === 6) void verifyCode(next); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void verifyCode(); }} />
          </label>
          <Button onClick={() => void verifyCode()} disabled={busy || code.length !== 6} aria-busy={busy || undefined}>Verify and continue</Button>
          <div className={styles.resendRow} id="otp-resend">
            {secondsLeft > 0 ? <>
              <svg className={styles.ring} viewBox="0 0 36 36" aria-hidden="true"><circle className={styles.ringTrack} cx="18" cy="18" r="15" /><circle className={styles.ringFill} cx="18" cy="18" r="15" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - Math.min(100, (secondsLeft / cooldownTotal) * 100)} /></svg>
              <span role="timer" aria-live="off">Didn’t get it? You can request a new code in <strong>{clock(secondsLeft)}</strong>.</span>
            </> : <>
              <span>Still nothing?</span>
              <button type="button" className={styles.linkButton} onClick={() => void requestCode()} disabled={busy || Boolean(turnstileSiteKey && !turnstileToken)}>Send a new code</button>
            </>}
          </div>
          <Field kind="select" label="Send the next code by" value={channel} onChange={(e) => setChannel(e.target.value as 'sms' | 'email')}><option value="sms" disabled={!pre.available_channels.sms}>SMS</option><option value="email" disabled={!pre.available_channels.email}>Email</option></Field>
          {secondsLeft > 0 && <small className={styles.security}>Switching between SMS and email does not shorten the wait. Please give the first code time to arrive.</small>}
        </div>}
        <p className={styles.security}>Bloomwell staff will never ask you to share your verification code.</p>
      </div>}

      {step === 'review' && view && <div className={styles.review}>
        <div className={styles.progress}><span>Read the agreement, then complete your details</span><span>Template version {view.template_version}</span></div>
        {view.variation_clause && <div className={styles.notice}>AMENDMENT — This agreement varies clause {view.variation_clause}. The original agreement remains in effect except for the change expressly approved here.</div>}
        <div className={styles.readBand}>
          <section className={styles.contractPane} aria-label="The agreement"><ContractReader clauses={view.clauses} documentHtml={view.document_html} reference={view.reference} /></section>
          <section className={styles.detailsPane} aria-label="Your details">
            <h2>Your details</h2>

            {choosing && <div className={styles.choice}>
              <p>Some sections are for you to complete: your details, your care preferences and your consents. How would you like to do this?</p>
              <div className={styles.choiceGrid}>
                <button type="button" className={styles.option} disabled={busy} onClick={() => void chooseMode('self')}>
                  <span className={styles.optionIcon}><PencilIcon /></span>
                  <span><strong>I will fill it in myself</strong><span>It takes a few minutes. Your answers save as you type.</span></span>
                </button>
                <button type="button" className={styles.option} disabled={busy} aria-pressed={assistOpen} onClick={() => setAssistOpen(true)}>
                  <span className={styles.optionIcon}><HelpIcon /></span>
                  <span><strong>Ask Bloomwell to fill it in for me</strong><span>A team member enters your details. You then check them and sign.</span></span>
                </button>
              </div>
              {assistOpen && <div className={styles.assist}>
                <p><strong>We will fill in your details for you.</strong> You still read the agreement and sign it yourself. You will get a message with a new link when everything is ready.</p>
                <Field kind="textarea" label="Anything we should know? (optional)" value={assistNote} maxLength={500} rows={3} onChange={(e) => setAssistNote(e.target.value)} />
                <div className={styles.actionRow}>
                  <Button onClick={() => void chooseMode('assisted', assistNote)} disabled={busy} aria-busy={busy || undefined}>Send my request</Button>
                  <Button variant="outline" onClick={() => setAssistOpen(false)} disabled={busy}>Back</Button>
                </div>
              </div>}
            </div>}

            {waiting && <div className={styles.waiting} role="status">
              <span className={styles.arch} aria-hidden="true"><span className={styles.pulse} /></span>
              <h3>Bloomwell is filling in your details</h3>
              <p>We have your request. A team member will enter your details from what we hold on record, then message you a new link by SMS or email. Open it, check the details and sign. You can keep reading the agreement while you wait.</p>
              <p>Need it sooner? Call <a href={`tel:${PHONE}`}>{PHONE}</a>.</p>
              {sessionReplaced && <div className={styles.notice}><strong>Your details are ready.</strong> Open the new link we just sent you by SMS or email to review and sign.</div>}
              <div className={styles.actionRow}>
                <Button variant="outline" onClick={() => void checkAgain()} disabled={busy} aria-busy={busy || undefined}>Check again</Button>
                <button type="button" className={styles.linkButton} onClick={() => void chooseMode('self')} disabled={busy}>I would rather fill it in myself</button>
              </div>
            </div>}

            {formOpen && <>
              {assistance === 'ready' && <div className={styles.notice}><strong>Bloomwell filled in your details at your request.</strong> Please check each one and change anything that is not right. Consent items are always yours to answer.</div>}
              <p>{assistance === 'ready' ? 'Check the details below. Everything else in the agreement has been completed by Bloomwell and is shown in the document.' : 'Please complete the details below. Everything else in the agreement has been completed by Bloomwell and is shown in the document.'}</p>
              {(() => {
                const groups = (['parties', 'schedule_a', 'schedule_b', 'schedule_c'] as const).flatMap((tabId) => SCHEDULE_SECTIONS[tabId].sections.map((section) => ({ ...section, group: SCHEDULE_SECTIONS[tabId].title })));
                const known = new Set(groups.flatMap((section) => section.paths));
                const leftovers = Object.keys(view.fields).filter((path) => !known.has(path) && !isHiddenField(path));
                const currentValue = (path: string): string => drafts[path] ?? toText(view.fields[path]?.value);
                const all = leftovers.length ? [...groups, { id: 'other', group: 'Other', title: 'Other details', paths: leftovers }] : groups;
                const currency = toText((drafts['schedule_b.currency'] ?? view.fields['schedule_b.currency']?.value)) || 'UGX';
                let lastGroup = '';
                const rendered = all.map((section) => {
                  const paths = section.paths.filter((path) => view.fields[path] && ['client', 'either'].includes(view.fields[path]!.owner) && (fieldMeta(path).showWhen?.(currentValue) ?? true)); // staff and clinical fields are already in the document above
                  if (!paths.length) return null;
                  const heading = section.group !== lastGroup ? <h3 className={styles.groupHeading}>{section.group}</h3> : null;
                  lastGroup = section.group;
                  return <div key={section.id}>
                    {heading}
                    <fieldset className={styles.fieldGroup}>
                      <legend>{section.title}</legend>
                      {paths.map((path) => {
                        const field = view.fields[path];
                        if (!field) return null;
                        const editable = field.owner === 'client' || field.owner === 'either';
                        const meta = fieldMeta(path);
                        return <div className={styles.formField} key={path}>
                          <label htmlFor={`client-${path}`}><span>{meta.label}{meta.required && <abbr title="Required"> *</abbr>}</span><small>{editable ? <SaveStatus state={saveState[path]} dirty={(drafts[path] ?? toText(field.value)) !== toText(field.value)} onRetry={() => void flushDrafts()} /> : 'Completed by Bloomwell'}</small></label>
                          {meta.help && <small>{meta.help}</small>}
                          <AgreementFieldInput path={path} id={`client-${path}`} value={drafts[path] ?? toText(field.value)} readOnly={!editable} currency={currency}
                            onChange={(value) => setDrafts((old) => ({ ...old, [path]: value }))} onCommit={(value) => void saveField(path, value)} />
                          {field.entered_by_staff && <small>Entered by a Bloomwell staff member on your behalf; please check it carefully.</small>}
                        </div>;
                      })}
                    </fieldset>
                  </div>;
                });
                return rendered.some(Boolean) ? rendered : <p className={styles.notice}>There is nothing for you to fill in. Please read the agreement, then sign below.</p>;
              })()}
              {hasClientFields && assistance === 'none' && <button type="button" className={styles.linkButton} onClick={() => setAssistOpen(true)} disabled={busy}>Prefer Bloomwell fills this in for me</button>}
              {assistOpen && formOpen && <div className={styles.assist}>
                <p><strong>Ask Bloomwell to fill in your details.</strong> Anything you have already entered is kept. You still sign it yourself.</p>
                <Field kind="textarea" label="Anything we should know? (optional)" value={assistNote} maxLength={500} rows={3} onChange={(e) => setAssistNote(e.target.value)} />
                <div className={styles.actionRow}>
                  <Button onClick={() => void chooseMode('assisted', assistNote).then(() => void flushDrafts())} disabled={busy} aria-busy={busy || undefined}>Send my request</Button>
                  <Button variant="outline" onClick={() => setAssistOpen(false)} disabled={busy}>Back</Button>
                </div>
              </div>}
            </>}
          </section>
        </div>

        {formOpen ? <div className={styles.signBand}>
          <section className={styles.feesPane} aria-label="Fee summary">
            <div className={styles.fees}><h3>Schedule B fee summary</h3>{Object.entries(view.schedule_b_computed).map(([key, value]) => <p key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{typeof value === 'number' ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(value)}</strong></p>)}</div>
          </section>
          <section className={styles.signPane} aria-label="Sign your agreement">
            {view?.is_test && <p className={styles.security}><strong>Practice agreement.</strong> This is for testing only and has no legal effect.</p>}
            <h2>Sign your agreement</h2>
            <p>By signing, you confirm that you have reviewed the agreement and the information shown above. Your signature is bound to this exact version.</p>
            <Field label="Your full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            <SignatureMethodPicker method={method} onMethod={(next) => { setMethod(next); setError(''); }} biometricAvailable={biometricAvailable}
              mode="client" password={password} onPassword={setPassword} confirm={confirmPassword} onConfirm={setConfirmPassword}
              drawPanel={<>
                <label className={styles.plain}>Draw your signature below</label>
                <canvas ref={signatureCanvas} className={styles.signature} width={800} height={180} aria-label="Signature drawing area" onPointerDown={beginStroke} onPointerMove={drawStroke} onPointerUp={endStroke} onPointerCancel={endStroke} />
              </>} />
            <Checkbox label={ESIGN_CONSENT_TEXT} checked={esignConsent} onChange={(e) => { setEsignConsent(e.target.checked); setError(''); }} />
            <div className={styles.signatureActions}>
              {method === 'drawn' && <Button variant="outline" onClick={clearSignature}>Clear signature</Button>}
              <Button onClick={() => void sign()} disabled={busy || !esignConsent} aria-busy={busy || undefined}>{method === 'biometric' ? 'Sign with fingerprint / face' : method === 'password' ? 'Sign with my passphrase' : 'Submit my signature'}</Button>
            </div>
            {!changeOpen && <button type="button" className={styles.linkButton} onClick={() => setChangeOpen(true)} disabled={busy}>Request a change instead</button>}
            {changeOpen && <div className={styles.changePanel}>
              <Field kind="textarea" label="Tell Bloomwell what you would like changed" value={changeReason} rows={4} onChange={(e) => setChangeReason(e.target.value)} />
              <div className={styles.actionRow}>
                <Button onClick={() => void sendChangeRequest()} disabled={busy} aria-busy={busy || undefined}>Send request</Button>
                <Button variant="outline" onClick={() => { setChangeOpen(false); setChangeReason(''); }} disabled={busy}>Cancel</Button>
              </div>
              <p className={styles.security}>Sending a change request pauses this link while Bloomwell reviews it.</p>
            </div>}
            <p className={styles.security}>A typed name alone is not accepted as a signature. Sign by drawing with your finger, stylus or mouse, by confirming with your phone's fingerprint or face, or with a passphrase you choose.</p>
          </section>
        </div> : <p className={styles.lockedSign}>{waiting ? 'Signing opens once Bloomwell has filled in your details and you have checked them.' : 'Signing opens after you choose how to fill in your details.'}</p>}
      </div>}

      {step === 'signed' && <div className={styles.done}>
        {pre?.purpose === 'view' && view ? <><div className={styles.signedBanner}>SIGNED AGREEMENT · {view.reference}</div>{view.variation_clause && <div className={styles.notice}>AMENDMENT — This agreement varies clause {view.variation_clause}{view.parent_reference ? ` of agreement ${view.parent_reference}` : ''}.</div>}{view.document_html ? <iframe className={styles.document} title="Signed agreement" srcDoc={view.document_html} sandbox="" /> : <><h2>Agreement clauses</h2>{Object.entries(view.clauses).map(([number, text]) => <details key={number}><summary>Clause {number}</summary><div>{text.split('\n').map((line, i) => line ? <p key={`${number}-${i}`}>{line}</p> : null)}</div></details>)}<h2>Parties and schedules</h2>{Object.entries(view.fields).map(([path, field]) => <div className={styles.formField} key={path}><label><span>{fieldLabel(path)}</span><small>{path.startsWith('schedule_a.') ? 'Schedule A' : path.startsWith('schedule_b.') ? 'Schedule B' : path.startsWith('schedule_c.') ? 'Schedule C' : 'Parties'}</small></label><p>{toText(field.value) || '—'}</p></div>)}</>}<div className={styles.fees}><h3>Fee summary</h3>{Object.entries(view.schedule_b_computed).map(([key, value]) => <p key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{String(value)}</strong></p>)}</div><h2>Signatures</h2>{(view.signatures ?? []).map((sig, index) => <div className={styles.formField} key={`${sig.role}-${index}`}><strong>{sig.role.replaceAll('_', ' ')}</strong><p>{sig.name}</p><small>{signatureMethodLabel(sig.method, sig.role)} · {new Date(sig.signed_at).toLocaleString()}</small></div>)}{view.certificate && <section className={styles.certificate} aria-labelledby="cert-title">
            <h2 id="cert-title">Certificate of completion</h2>
            {view.certificate.practice && <div className={styles.error}>Practice agreement. No legal effect.</div>}
            <dl className={styles.certGrid}>
              <div><dt>Reference</dt><dd>{view.certificate.reference ?? view.reference}</dd></div>
              <div><dt>Client</dt><dd>{view.certificate.client || '—'}</dd></div>
              <div><dt>Patient</dt><dd>{view.certificate.patient || '—'}</dd></div>
              <div><dt>You signed</dt><dd>{when(view.certificate.client_signed_at)}</dd></div>
              <div><dt>Bloomwell countersigned</dt><dd>{when(view.certificate.countersigned_at)}</dd></div>
              <div><dt>Sealed</dt><dd>{when(view.certificate.sealed_at)}</dd></div>
            </dl>
            {view.certificate.signers.map((sig, i) => <p key={`${sig.role}-${i}`} className={styles.certSigner}><strong>{sig.name}</strong> · {sig.role === 'bloomwell' ? 'Bloomwell' : 'Client'} · {signatureMethodLabel(sig.method, sig.role)} · {when(sig.signed_at)}</p>)}
            {view.certificate.content_hash && <small className={styles.certHash}>Fingerprint: {view.certificate.content_hash}</small>}
          </section>}
          <div className={styles.actionRow}>
            {view.pdf_available && <Button onClick={() => void downloadSignedPdf()} disabled={busy} aria-busy={busy || undefined}>Download signed PDF</Button>}
            <Button variant="outline" onClick={() => window.print()}>Print this page</Button>
          </div></> : changeRequested ? <><div className={styles.successMark} aria-hidden="true">✓</div><h2>Your change request was sent</h2><p>The agreement link is paused. Bloomwell staff will review your request and send an updated link if needed.</p></> : <><div className={styles.successMark} aria-hidden="true">✓</div><h2>Your signature has been received</h2><p>Bloomwell will countersign the agreement. When it is complete, we will email and text you a link. Open it, verify with a new code, and you can view the signed agreement and download your PDF copy, which also comes attached to the email.</p></>}
      </div>}
    </section>
  </AgreementShell>;
}

export function AgreementPublicPage() {
  return <AgreementPublicPageInner />;
}
