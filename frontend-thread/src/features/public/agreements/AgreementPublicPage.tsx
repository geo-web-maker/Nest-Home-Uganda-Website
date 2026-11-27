import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { API_PREFIX, ApiError, apiClient } from '../../../lib/api/client';
import { createPasskey, passkeysSupported, type PasskeyCreationOptions } from '../../../lib/webauthn';
import { isHiddenField } from '../../agreements/fieldMeta';
import { credentialProblem, type SignatureChoice } from '../../agreements/SignatureMethodPicker';
import { AgreementProblem } from './AgreementProblem';
import { AgreementShell } from './AgreementShell';
import { ContractReader } from './ContractReader';
import { describeLinkFailure, loadWithRetry } from './linkFailure';
import styles from './AgreementPublicPage.module.css';

import {
  PHONE,
  RESEND_FALLBACK_SECONDS,
  Steps,
  toText,
  type OtpSent,
  type PreOtp,
  type PublicAgreement,
} from './AgreementPublicParts';
import { SignedAgreementView } from './SignedAgreementView';
import { AgreementSigningPanel } from './AgreementSigningPanel';
import { ClientAgreementFields } from './ClientAgreementFields';
import { OtpVerificationPanel } from './OtpVerificationPanel';
import { AgreementAssistanceOptions } from './AgreementAssistanceOptions';
import { useAgreementSignatureCanvas } from './useAgreementSignatureCanvas';
import { useAgreementDraftAutosave } from './useAgreementDraftAutosave';

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
  const { signatureCanvas, hasInk, beginStroke, drawStroke, endStroke, clearSignature } = useAgreementSignatureCanvas();
  const [method, setMethod] = useState<SignatureChoice>('drawn');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [esignConsent, setEsignConsent] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const viewRef = useRef<PublicAgreement | null>(null);
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
  const { saveState, saveField, flushDrafts } = useAgreementDraftAutosave({
    step,
    drafts,
    viewRef,
    setView,
    setError,
    loadReview,
  });

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
      if (!response.ok) {
        const message =
          response.status === 403
            ? 'Your session has expired. Please verify again to download the PDF.'
            : `The signed PDF is not available right now. Please try again, or call ${PHONE}.`;
        throw new Error(message);
      }
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
      await loadReview(pre.purpose);
      setNotice(
        pre.purpose === 'view'
          ? 'Your signed agreement is verified.'
          : 'You are verified. Read your agreement, then choose how to fill in your details.',
      );
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'That code could not be verified.'); }
    finally { setBusy(false); }
  };

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
  const hasClientFields = view
    ? Object.entries(view.fields).some(
        ([path, field]) => ['client', 'either'].includes(field.owner) && !isHiddenField(path),
      )
    : false;
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

      {step === 'verify' && pre && (
        <OtpVerificationPanel
          pre={pre}
          delivery={delivery}
          channel={channel}
          onChannelChange={setChannel}
          busy={busy}
          turnstileSiteKey={turnstileSiteKey}
          turnstileRef={turnstileRef}
          turnstileToken={turnstileToken}
          onRequestCode={() => void requestCode()}
          secondsLeft={secondsLeft}
          cooldownTotal={cooldownTotal}
          code={code}
          codeInput={codeInput}
          onCodeChange={setCode}
          onVerifyCode={(entered) => void verifyCode(entered)}
        />
      )}

      {step === 'review' && view && <div className={styles.review}>
        <div className={styles.progress}><span>Read the agreement, then complete your details</span><span>Template version {view.template_version}</span></div>
        {view.variation_clause && (
          <div className={styles.notice}>
            AMENDMENT — This agreement varies clause {view.variation_clause}. The original agreement remains in effect
            except for the change expressly approved here.
          </div>
        )}
        <div className={styles.readBand}>
          <section className={styles.contractPane} aria-label="The agreement">
            <ContractReader
              clauses={view.clauses}
              documentHtml={view.document_html}
              reference={view.reference}
            />
          </section>
          <section className={styles.detailsPane} aria-label="Your details">
            <h2>Your details</h2>

            <AgreementAssistanceOptions
              choosing={choosing}
              waiting={waiting}
              assistOpen={assistOpen}
              assistNote={assistNote}
              busy={busy}
              sessionReplaced={sessionReplaced}
              onChooseSelf={() => void chooseMode('self')}
              onOpenAssistance={() => setAssistOpen(true)}
              onAssistNoteChange={setAssistNote}
              onRequestAssistance={() => void chooseMode('assisted', assistNote)}
              onCloseAssistance={() => setAssistOpen(false)}
              onCheckAgain={() => void checkAgain()}
            />

            {formOpen && (
              <ClientAgreementFields
                agreement={view}
                assistance={assistance}
                hasClientFields={hasClientFields}
                drafts={drafts}
                saveState={saveState}
                assistOpen={assistOpen}
                assistNote={assistNote}
                busy={busy}
                onDraftChange={(path, value) => setDrafts((old) => ({ ...old, [path]: value }))}
                onCommit={(path, value) => void saveField(path, value)}
                onRetrySave={() => void flushDrafts()}
                onOpenAssistance={() => setAssistOpen(true)}
                onAssistNoteChange={setAssistNote}
                onRequestAssistance={() => void chooseMode('assisted', assistNote).then(() => void flushDrafts())}
                onCloseAssistance={() => setAssistOpen(false)}
              />
            )}
          </section>
        </div>

        {formOpen ? (
          <AgreementSigningPanel
            agreement={view}
            name={name}
            onNameChange={setName}
            method={method}
            onMethodChange={(next) => {
              setMethod(next);
              setError('');
            }}
            biometricAvailable={biometricAvailable}
            password={password}
            onPasswordChange={setPassword}
            confirmPassword={confirmPassword}
            onConfirmPasswordChange={setConfirmPassword}
            signatureCanvas={signatureCanvas}
            onBeginStroke={beginStroke}
            onDrawStroke={drawStroke}
            onEndStroke={endStroke}
            esignConsent={esignConsent}
            onEsignConsentChange={(next) => {
              setEsignConsent(next);
              setError('');
            }}
            onClearSignature={clearSignature}
            onSign={() => void sign()}
            busy={busy}
            changeOpen={changeOpen}
            onChangeOpen={setChangeOpen}
            changeReason={changeReason}
            onChangeReason={setChangeReason}
            onSendChangeRequest={() => void sendChangeRequest()}
          />
        ) : (
          <p className={styles.lockedSign}>
            {waiting
              ? 'Signing opens once Bloomwell has filled in your details and you have checked them.'
              : 'Signing opens after you choose how to fill in your details.'}
          </p>
        )}
      </div>}

      {step === 'signed' && (
        <SignedAgreementView
          agreement={view}
          viewPurpose={pre?.purpose === 'view'}
          changeRequested={changeRequested}
          busy={busy}
          onDownloadPdf={() => void downloadSignedPdf()}
        />
      )}
    </section>
  </AgreementShell>;
}

export function AgreementPublicPage() {
  return <AgreementPublicPageInner />;
}
