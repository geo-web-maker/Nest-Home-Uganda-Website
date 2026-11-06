import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../../../lib/api/client';
import styles from './AgreementPublicPage.module.css';

type AgreementField = { value: unknown; owner: 'staff' | 'clinical' | 'client' | 'either'; revision: number; entered_by_staff: boolean };
type PublicAgreement = {
  company: string; reference: string; status: string; template_version: number;
  clauses: Record<string, string>; fields: Record<string, AgreementField>;
  schedule_b_computed: Record<string, string | number>; content_hash: string;
  signed: boolean; variation_clause?: string | null; parent_reference?: string | null;
  signatures?: Array<{ role: string; name: string; method: string; signed_at: string }>;
  certificate?: Record<string, unknown> | null;
};
type PreOtp = { company: string; message: string; phone_hint?: string | null; email_hint?: string | null; available_channels: { sms: boolean; email: boolean }; purpose: 'sign' | 'view' };
type OtpSent = { message: string; destination_hint: string };
type TurnstileApi = {
  render: (container: HTMLElement, options: {
    sitekey: string; callback: (token: string) => void;
    'expired-callback'?: () => void; 'error-callback'?: () => void;
  }) => string;
  remove?: (widgetId: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

function fieldLabel(path: string): string { return path.split('.').at(-1)?.replaceAll('_', ' ') ?? path; }
function toText(value: unknown): string { return value === null || value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value, null, 2); }

export function AgreementPublicPage() {
  const { token = '' } = useParams();
  const [pre, setPre] = useState<PreOtp | null>(null);
  const [view, setView] = useState<PublicAgreement | null>(null);
  const [step, setStep] = useState<'verify' | 'review' | 'signed'>('verify');
  const [channel, setChannel] = useState<'sms' | 'email'>('sms');
  const [code, setCode] = useState('');
  const [delivery, setDelivery] = useState<OtpSent | null>(null);
  const [name, setName] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [changeRequested, setChangeRequested] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const signatureCanvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  const loadReview = useCallback(async (purpose: 'sign' | 'view') => {
    const endpoint = purpose === 'view' ? '/public/agreements/session/signed' : '/public/agreements/session';
    const result = await apiClient.get<PublicAgreement>(endpoint);
    setView(result);
    setDrafts(Object.fromEntries(Object.entries(result.fields).map(([path, field]) => [path, toText(field.value)])));
    setStep(purpose === 'view' ? 'signed' : 'review');
  }, []);

  useEffect(() => {
    let active = true;
    void apiClient.get<PreOtp>(`/public/agreements/${encodeURIComponent(token)}`).then(async (result) => {
      if (!active) return;
      setPre(result);
      setChannel(result.available_channels.sms ? 'sms' : 'email');
      try { await loadReview(result.purpose); } catch { /* No valid OTP session yet. */ }
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'This agreement link is no longer available.');
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
    if (!pre) return;
    setBusy(true); setError(''); setNotice(''); setDelivery(null);
    try {
      const suffix = pre.purpose === 'view' ? 'request-view' : 'request';
      const sent = await apiClient.post<OtpSent>(`/public/agreements/${encodeURIComponent(token)}/otp/${suffix}`, {
        channel, ...(turnstileToken ? { turnstile_token: turnstileToken } : {}),
      });
      setDelivery(sent); setNotice(sent.message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The verification code could not be sent.'); }
    finally { setBusy(false); }
  };

  const verifyCode = async () => {
    if (!pre) return;
    setBusy(true); setError('');
    try {
      const suffix = pre.purpose === 'view' ? 'verify-view' : 'verify';
      await apiClient.post(`/public/agreements/${encodeURIComponent(token)}/otp/${suffix}`, { code });
      await loadReview(pre.purpose); setNotice(pre.purpose === 'view' ? 'Your signed agreement is verified.' : 'Your agreement is ready to review.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'That code could not be verified.'); }
    finally { setBusy(false); }
  };

  const saveField = async (path: string) => {
    if (!view) return;
    const field = view.fields[path];
    if (!field || !['client', 'either'].includes(field.owner)) return;
    const value = drafts[path] ?? '';
    if (value === toText(field.value)) return;
    setBusy(true); setError('');
    try {
      const updated = await apiClient.patch<PublicAgreement>('/public/agreements/session/fields', {
        changes: [{ path, value, expected_revision: field.revision, entered_by_staff: false }],
      });
      setView(updated);
      setDrafts((old) => ({ ...old, [path]: value }));
      setNotice(`${fieldLabel(path)} saved.`);
    } catch (cause) {
      if (cause instanceof Error && 'status' in cause && (cause as { status: number }).status === 409) {
        try {
          await loadReview('sign');
          setError(`${fieldLabel(path)} was updated by someone else. The latest saved version is now displayed; review it before making another change.`);
        } catch { setError('This review session expired. Verify again to continue.'); }
      } else setError(cause instanceof Error ? cause.message : 'This field could not be saved.');
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
    context.lineWidth = 2.5; context.lineCap = 'round'; context.lineJoin = 'round'; context.strokeStyle = '#163d2e';
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

  const sign = async () => {
    if (!view || !signatureCanvas.current || !hasInk.current || name.trim().length < 2) {
      setError('Enter your name and draw your signature in the box before submitting.'); return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const signature_base64 = signatureCanvas.current.toDataURL('image/png');
      const result = await apiClient.post<{ signed: boolean }>('/public/agreements/session/sign', {
        name: name.trim(), role: 'client', method: 'drawn', signature_base64,
        expected_content_hash: view.content_hash,
      });
      if (result.signed) { setStep('signed'); setNotice('Your signature has been received. Bloomwell will countersign and send confirmation.'); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your signature could not be recorded.'); }
    finally { setBusy(false); }
  };

  const requestChange = async () => {
    const reason = window.prompt('Tell Bloomwell what you would like changed:');
    if (!reason?.trim()) return;
    setBusy(true); setError('');
    try {
      const result = await apiClient.post<{ message: string }>('/public/agreements/session/request-change', { reason });
      setNotice(result.message); setChangeRequested(true); setStep('signed');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your request could not be sent.'); }
    finally { setBusy(false); }
  };

  if (error && !pre) return <main className={styles.page}><section className={styles.card}><h1>Agreement link unavailable</h1><p>{error}</p><p>Call Bloomwell on <a href="tel:0787499988">0787499988</a> for help.</p></section></main>;

  return <main className={styles.page}>
    <header className={styles.brand}><span className={styles.brandMark}>B</span><div><strong>Bloomwell Home Care</strong><small>Client care agreement</small></div></header>
    <section className={styles.card}>
      <p className={styles.eyebrow}>BLOOMWELL HOME CARE UGANDA LIMITED</p>
      <h1>{step === 'verify' ? (pre?.purpose === 'view' ? 'View your signed agreement' : 'Review your care agreement') : step === 'review' ? 'Your care agreement' : pre?.purpose === 'view' ? 'Signed agreement' : 'Thank you'}</h1>
      {pre && <p className={styles.reference}>Reference: {view?.reference ?? 'Verify to continue'}</p>}
      {error && <div className={styles.error} role="alert">{error}</div>}
      {notice && <div className={styles.notice} role="status">{notice}</div>}

      {step === 'verify' && pre && <div className={styles.verify}>
        <p>For your privacy, we will send a short verification code to the contact already recorded on your agreement. No agreement details are shown until you verify.</p>
        <div className={styles.contactHint}>{pre.phone_hint && <span>Phone: {pre.phone_hint}</span>}{pre.email_hint && <span>Email: {pre.email_hint}</span>}</div>
        <label>Send code by<select value={channel} onChange={(e) => setChannel(e.target.value as 'sms' | 'email')}><option value="sms" disabled={!pre.available_channels.sms}>SMS</option><option value="email" disabled={!pre.available_channels.email}>Email</option></select></label>
        {!pre.available_channels.sms && !pre.available_channels.email && <p className={styles.security}>Bloomwell cannot currently send a verification code to this agreement's recorded contacts. No agreement details are displayed. Please call 0787499988 for assistance.</p>}
        {turnstileSiteKey && <div className={styles.turnstile} ref={turnstileRef} aria-label="Security verification" />}
        <button type="button" className={styles.primary} onClick={() => void requestCode()} disabled={busy || (!pre.available_channels.sms && !pre.available_channels.email) || !pre.available_channels[channel] || Boolean(turnstileSiteKey && !turnstileToken)}>Send verification code</button>
        {delivery && <><label>Six-digit verification code<input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} /></label><button type="button" className={styles.primary} onClick={() => void verifyCode()} disabled={busy || code.length !== 6}>Verify and continue</button></>}
        <p className={styles.security}>Bloomwell staff will never ask you to share your verification code.</p>
      </div>}

      {step === 'review' && view && <div className={styles.review}>
        <div className={styles.progress}><span>Review and complete each section</span><span>Template version {view.template_version}</span></div>
        {view.variation_clause && <div className={styles.notice}>AMENDMENT — This agreement varies clause {view.variation_clause}. The original agreement remains in effect except for the change expressly approved here.</div>}
        <div className={styles.clauses}>{Object.entries(view.clauses).map(([number, text]) => <details key={number}><summary>Clause {number}</summary><div>{text.split('\n').map((line, i) => line ? <p key={`${number}-${i}`}>{line}</p> : null)}</div></details>)}</div>
        <h2>Agreement details and schedules</h2>
        <p>Fields marked read-only have been completed by Bloomwell staff. You can edit fields marked as client or shared.</p>
        {Object.entries(view.fields).map(([path, field]) => {
          const editable = field.owner === 'client' || field.owner === 'either';
          return <div className={styles.formField} key={path}>
            <label htmlFor={`client-${path}`}><span>{fieldLabel(path)}</span><small>{editable ? 'Your field' : 'Read-only · Bloomwell staff'}</small></label>
            <textarea id={`client-${path}`} rows={2} value={drafts[path] ?? toText(field.value)} readOnly={!editable} onChange={(e) => setDrafts((old) => ({ ...old, [path]: e.target.value }))} onBlur={() => void saveField(path)} />
            {field.entered_by_staff && <small>Entered by a Bloomwell staff member on your behalf; please check it carefully.</small>}
          </div>;
        })}
        <div className={styles.fees}><h3>Schedule B fee summary</h3>{Object.entries(view.schedule_b_computed).map(([key, value]) => <p key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{String(value)}</strong></p>)}</div>
        <h2>Sign your agreement</h2>
        <p>By signing, you confirm that you have reviewed the agreement and the information shown above. Your signature is bound to this exact version.</p>
        <label>Your full name<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
        <label>Draw your signature below</label>
        <canvas ref={signatureCanvas} className={styles.signature} width={800} height={180} aria-label="Signature drawing area" onPointerDown={beginStroke} onPointerMove={drawStroke} onPointerUp={endStroke} onPointerCancel={endStroke} />
        <div className={styles.signatureActions}><button type="button" className={styles.secondary} onClick={clearSignature}>Clear signature</button><button type="button" className={styles.primary} onClick={() => void sign()} disabled={busy}>Submit my signature</button></div>
        <button type="button" className={styles.linkButton} onClick={() => void requestChange()} disabled={busy}>Request a change instead</button>
        <p className={styles.security}>A typed name alone is not accepted as a signature. You may draw your signature using your finger, stylus or mouse.</p>
      </div>}

      {step === 'signed' && <div className={styles.done}>
        {pre?.purpose === 'view' && view ? <><div className={styles.signedBanner}>SIGNED AGREEMENT · {view.reference}</div>{view.variation_clause && <div className={styles.notice}>AMENDMENT — This agreement varies clause {view.variation_clause}{view.parent_reference ? ` of agreement ${view.parent_reference}` : ''}.</div>}<h2>Agreement clauses</h2>{Object.entries(view.clauses).map(([number, text]) => <details key={number}><summary>Clause {number}</summary><div>{text.split('\n').map((line, i) => line ? <p key={`${number}-${i}`}>{line}</p> : null)}</div></details>)}<h2>Parties and schedules</h2>{Object.entries(view.fields).map(([path, field]) => <div className={styles.formField} key={path}><label><span>{fieldLabel(path)}</span><small>{path.startsWith('schedule_a.') ? 'Schedule A' : path.startsWith('schedule_b.') ? 'Schedule B' : path.startsWith('schedule_c.') ? 'Schedule C' : 'Parties'}</small></label><p>{toText(field.value) || '—'}</p></div>)}<div className={styles.fees}><h3>Fee summary</h3>{Object.entries(view.schedule_b_computed).map(([key, value]) => <p key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{String(value)}</strong></p>)}</div><h2>Signatures</h2>{(view.signatures ?? []).map((sig, index) => <div className={styles.formField} key={`${sig.role}-${index}`}><strong>{sig.role.replaceAll('_', ' ')}</strong><p>{sig.name}</p><small>{sig.method} · {new Date(sig.signed_at).toLocaleString()}</small></div>)}{view.certificate && <section className={styles.certificate}><h2>Certificate of completion</h2>{Object.entries(view.certificate).map(([key, value]) => <p key={key}><strong>{key.replaceAll('_', ' ')}:</strong> {typeof value === 'object' ? JSON.stringify(value) : String(value)}</p>)}</section>}<button type="button" className={styles.primary} onClick={() => window.print()}>Print signed agreement</button></> : changeRequested ? <><div className={styles.successMark}>✓</div><h2>Your change request was sent</h2><p>The agreement link is paused. Bloomwell staff will review your request and send an updated link if needed.</p></> : <><div className={styles.successMark}>✓</div><h2>Your signature has been received</h2><p>Bloomwell will countersign the agreement and send you a confirmation. When it is complete, you can verify again to view the signed agreement online.</p></>}
      </div>}
    </section>
    <footer className={styles.footer}>Questions? Call <a href="tel:0787499988">0787499988</a> or email <a href="mailto:info@bhcug.com">info@bhcug.com</a>. Your agreement remains private.</footer>
  </main>;
}
