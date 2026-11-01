import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { copy } from '../../copy';
import { captureLocation } from '../../platform/location';
import type { LocationSnapshot } from '../../platform/location';
import { Banner } from '../../ui/Banner';
import { PillButton } from '../../ui/PillButton';
import { Sheet, SheetActions } from '../../ui/Sheet';

export type SosSendResult = { caseId?: string | null; serverConfirmed: boolean };
export type LiveFollowStartResult = { until: string; intervalSeconds: number };
type FollowSession = { caseId: string; untilMs: number; intervalSeconds: number };
type Props = {
  enabled: boolean;
  smsHref: string;
  emergencyNumbers?: string[];
  supervisorPhone?: string | null;
  liveFollowEnabled?: boolean;
  liveFollowMinutes?: number;
  liveFollowIntervalSeconds?: number;
  holdSeconds?: number;
  cancelWindowSeconds?: number;
  onSend: () => Promise<SosSendResult | void>;
  onStartFollow?: (caseId: string) => Promise<LiveFollowStartResult>;
  onPingFollow?: (caseId: string, snapshot: LocationSnapshot, capturedAt: string) => Promise<void>;
  onSafeNow?: (caseId: string) => Promise<void>;
};

function safeTelephoneHref(rawNumber: string): string | null {
  const number = rawNumber.trim().replace(/[\s().-]/g, '');
  return /^\+?[0-9]{5,15}$/.test(number) ? `tel:${number}` : null;
}

/** Requires a deliberate hold, then allows a configurable cancellation window. */
export function SosControl({
  enabled, smsHref, emergencyNumbers = [], supervisorPhone, liveFollowEnabled = false,
  liveFollowMinutes = 30, liveFollowIntervalSeconds = 30, holdSeconds = 2, cancelWindowSeconds = 5,
  onSend, onStartFollow, onPingFollow, onSafeNow,
}: Props) {
  const holdTimer = useRef<number | undefined>(undefined);
  const sendRef = useRef(onSend);
  const startFollowRef = useRef(onStartFollow);
  const pingFollowRef = useRef(onPingFollow);
  const safeNowRef = useRef(onSafeNow);
  const pingInFlight = useRef(false);
  const lastPingAt = useRef(0);
  const lastPingAttemptAt = useRef(0);
  const [open, setOpen] = useState(false);
  const [holding, setHolding] = useState(false);
  const [remaining, setRemaining] = useState(cancelWindowSeconds);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [sendResult, setSendResult] = useState<SosSendResult | null>(null);
  const [follow, setFollow] = useState<FollowSession | null>(null);
  const [startingFollow, setStartingFollow] = useState(false);
  const [safeSubmitting, setSafeSubmitting] = useState(false);
  const [safeConfirmed, setSafeConfirmed] = useState(false);
  const [followMessage, setFollowMessage] = useState('');
  const configuredHoldSeconds = Number.isFinite(holdSeconds) ? Math.max(1, Math.min(10, Math.floor(holdSeconds))) : 2;
  const configuredCancelSeconds = Number.isFinite(cancelWindowSeconds) ? Math.max(1, Math.min(15, Math.floor(cancelWindowSeconds))) : 5;
  const holdLabel = copy.safety.hold.replace('2 seconds', `${configuredHoldSeconds} seconds`);
  sendRef.current = onSend;
  startFollowRef.current = onStartFollow;
  pingFollowRef.current = onPingFollow;
  safeNowRef.current = onSafeNow;

  function clearHold() {
    if (holdTimer.current !== undefined) window.clearTimeout(holdTimer.current);
    holdTimer.current = undefined;
    setHolding(false);
  }
  function beginHold() {
    if (!enabled || holdTimer.current !== undefined) return;
    setHolding(true);
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = undefined;
      setHolding(false);
      setRemaining(configuredCancelSeconds);
      setOpen(true);
      setSent(false);
      setError('');
      setSendResult(null);
      setFollow(null);
      setFollowMessage('');
      setSafeConfirmed(false);
    }, configuredHoldSeconds * 1_000);
  }
  function close() {
    setOpen(false);
    setSending(false);
    setSent(false);
    setError('');
    setFollow(null);
    setFollowMessage('');
    setSendResult(null);
    setSafeConfirmed(false);
  }

  useEffect(() => {
    if (!open || sent || sending) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1_000);
    return () => window.clearInterval(timer);
  }, [open, sent, sending]);

  useEffect(() => {
    if (!open || sent || sending || remaining > 0) return;
    setSending(true);
    void sendRef.current().then((result) => {
      const normalized = result && typeof result === 'object'
        ? { caseId: result.caseId ?? null, serverConfirmed: Boolean(result.serverConfirmed) }
        : { caseId: null, serverConfirmed: false };
      setSendResult(normalized);
      setSent(true);
    }).catch(() => {
      setError(copy.safety.sendFailed);
      setSending(false);
    });
  }, [open, remaining, sent, sending]);

  useEffect(() => () => {
    if (holdTimer.current !== undefined) window.clearTimeout(holdTimer.current);
  }, []);

  useEffect(() => {
    if (!follow || !sent) return;
    let alive = true;
    const ping = async () => {
      if (!alive || document.visibilityState !== 'visible') return;
      if (Date.now() >= follow.untilMs) {
        if (alive) {
          setFollow(null);
          setFollowMessage(copy.safety.liveFollowDeadline);
        }
        return;
      }
      if (pingInFlight.current || Date.now() - lastPingAttemptAt.current < follow.intervalSeconds * 1_000) return;
      pingInFlight.current = true;
      lastPingAttemptAt.current = Date.now();
      try {
        const capturedAt = new Date().toISOString();
        const snapshot = await captureLocation();
        if (!alive || snapshot.lat === null || snapshot.lng === null) return;
        const pingHandler = pingFollowRef.current;
        if (!pingHandler) return;
        await pingHandler(follow.caseId, snapshot, capturedAt);
        lastPingAt.current = Date.now();
        if (alive) setFollowMessage(copy.safety.liveFollowActive);
      } catch {
        if (alive) setFollowMessage(copy.safety.followPingUnavailable);
      } finally {
        pingInFlight.current = false;
      }
    };
    // A first foreground snapshot is sent after explicit opt-in; later snapshots obey the server interval.
    if (Date.now() - lastPingAttemptAt.current >= follow.intervalSeconds * 1_000) void ping();
    const timer = window.setInterval(() => {
      if (Date.now() - lastPingAttemptAt.current >= follow.intervalSeconds * 1_000) void ping();
      else if (Date.now() >= follow.untilMs) {
        setFollow(null);
        setFollowMessage(copy.safety.liveFollowDeadline);
      }
    }, Math.min(follow.intervalSeconds * 1_000, 5_000));
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastPingAttemptAt.current >= follow.intervalSeconds * 1_000) void ping();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [follow, sent]);

  async function startFollow() {
    const caseId = sendResult?.serverConfirmed ? sendResult.caseId : null;
    const handler = startFollowRef.current;
    if (!caseId || !handler || startingFollow) return;
    setStartingFollow(true);
    setError('');
    try {
      const started = await handler(caseId);
      const untilMs = Date.parse(started.until);
      if (!Number.isFinite(untilMs) || untilMs <= Date.now()) throw new Error('Invalid live-follow deadline');
      lastPingAt.current = 0;
      lastPingAttemptAt.current = 0;
      setFollow({ caseId, untilMs, intervalSeconds: Math.max(15, Math.min(300, started.intervalSeconds || liveFollowIntervalSeconds)) });
      setFollowMessage(copy.safety.liveFollowActive);
    } catch {
      setError(copy.safety.followStartUnavailable);
    } finally {
      setStartingFollow(false);
    }
  }

  async function reportSafeNow() {
    const caseId = sendResult?.serverConfirmed ? sendResult.caseId : null;
    const handler = safeNowRef.current;
    if (!caseId || !handler || safeSubmitting) return;
    setSafeSubmitting(true);
    setError('');
    try {
      await handler(caseId);
      setFollow(null);
      setSafeConfirmed(true);
      setFollowMessage(copy.safety.liveFollowStopped);
    } catch {
      setError(copy.safety.safeNotConfirmed);
    } finally {
      setSafeSubmitting(false);
    }
  }

  type CallOption = { number: string; label: string; href: string };
  const safeNumbers = emergencyNumbers
    .map((number): { number: string; label: string; href: string | null } => ({ number, label: copy.safety.callEmergency, href: safeTelephoneHref(number) }))
    .filter((item): item is CallOption => Boolean(item.href));
  const supervisor = supervisorPhone ? { number: supervisorPhone, label: copy.safety.callSupervisor, href: safeTelephoneHref(supervisorPhone) } : null;
  const callOptions: CallOption[] = [...(supervisor?.href ? [supervisor as CallOption] : []), ...safeNumbers];
  const confirmedServerCase = Boolean(sendResult?.serverConfirmed && sendResult.caseId);

  return (
    <>
      <button
        type="button"
        className={`sos-button${holding ? ' is-holding' : ''}`}
        style={{ '--sos-hold-duration': `${configuredHoldSeconds}s` } as CSSProperties}
        aria-label={holdLabel}
        aria-disabled={!enabled}
        disabled={!enabled}
        onPointerDown={beginHold}
        onPointerUp={clearHold}
        onPointerLeave={clearHold}
        onPointerCancel={clearHold}
        onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') beginHold(); }}
        onKeyUp={clearHold}
        title={enabled ? holdLabel : copy.shell.sosDisabled}
      >{copy.safety.buttonLabel}</button>
      {open && (
          <Sheet role="alertdialog" labelledBy="sos-title" describedBy="sos-description" className="sos-sheet">
            <h2 id="sos-title">{sent ? copy.safety.recorded : copy.safety.dialog}</h2>
            <p id="sos-description">{copy.safety.emergency}</p>
            {!sent && <p aria-live="polite">{sending ? copy.safety.sending : `${copy.safety.countdown} ${remaining} ${copy.safety.countdownSeconds}`}</p>}
            {error && <p role="alert">{error}</p>}
            {sent && <p role="status">{sendResult?.serverConfirmed ? copy.safety.sentOnline : copy.safety.sentQueued}</p>}
            {sent && callOptions.length === 0 && <Banner tone="warn">{copy.safety.noContactConfigured}</Banner>}
            {sent && callOptions.length > 0 && <div className="sos-call-options" aria-label={copy.safety.callEmergency}>
              {callOptions.map(({ number, label, href }) => <a className="sos-call-link" href={href} key={`${number}:${href}`}>{label} · {number}</a>)}
            </div>}
            {sent && liveFollowEnabled && confirmedServerCase && !safeConfirmed && !follow && onStartFollow && <section className="live-follow-panel">
              <h3>{copy.safety.liveFollowTitle}</h3>
              <p>{copy.safety.liveFollowStart} {liveFollowMinutes} {copy.safety.liveFollowMinutes}. {copy.safety.liveFollowDisclosure}</p>
              <PillButton type="button" tone="forest" size="full" onClick={() => void startFollow()} disabled={startingFollow}>{startingFollow ? copy.safety.liveFollowStarting : copy.safety.liveFollowStartButton}</PillButton>
            </section>}
            {follow && <section className="live-follow-panel" aria-live="polite"><h3>{copy.safety.liveFollowTitle}</h3><p>{copy.safety.liveFollowActive}</p><p>{copy.safety.liveFollowDeadlineLabel}: {new Date(follow.untilMs).toLocaleString()}</p></section>}
            {followMessage && <p role="status">{followMessage}</p>}
            {sent && confirmedServerCase && onSafeNow && !safeConfirmed && <PillButton type="button" tone="ghost" size="full" showArrow={false} onClick={() => void reportSafeNow()} disabled={safeSubmitting}>{safeSubmitting ? copy.safety.safeSubmitting : copy.safety.safeNow}</PillButton>}
            {safeConfirmed && <p role="status">{copy.safety.liveFollowStopped}</p>}
            {!sent && <SheetActions><PillButton type="button" tone="ghost" size="full" showArrow={false} onClick={close}>{copy.safety.cancel}</PillButton></SheetActions>}
            {sent && !sendResult?.serverConfirmed && <SheetActions><PillButton type="button" tone="ghost" size="full" showArrow={false} onClick={close}>{copy.safety.closeDetails}</PillButton><a href={smsHref}>{copy.safety.sms}</a></SheetActions>}
            {sent && sendResult?.serverConfirmed && safeConfirmed && <SheetActions><PillButton type="button" tone="ghost" size="full" showArrow={false} onClick={close}>{copy.safety.closeDetails}</PillButton></SheetActions>}
          </Sheet>
      )}
    </>
  );
}
