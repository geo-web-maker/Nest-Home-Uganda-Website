import { useEffect, useRef, useState } from 'react';
import { copy } from '../../copy';

type Props = { enabled: boolean; smsHref: string; onSend: () => Promise<void> };

/** Requires a deliberate hold, then allows a five-second cancellation window. */
export function SosControl({ enabled, smsHref, onSend }: Props) {
  const holdTimer = useRef<number | undefined>(undefined);
  const sendRef = useRef(onSend);
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState(5);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  sendRef.current = onSend;

  function clearHold() {
    if (holdTimer.current !== undefined) window.clearTimeout(holdTimer.current);
    holdTimer.current = undefined;
  }
  function beginHold() {
    if (!enabled || holdTimer.current !== undefined) return;
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = undefined;
      setRemaining(5);
      setOpen(true);
      setSent(false);
      setError('');
    }, 2_000);
  }
  function close() {
    setOpen(false);
    setSending(false);
    setSent(false);
    setError('');
  }

  useEffect(() => {
    if (!open || sent || sending) return;
    if (remaining <= 0) {
      setSending(true);
      void sendRef.current().then(() => setSent(true)).catch(() => {
        setError(copy.safety.sendFailed);
        setSending(false);
      });
      return;
    }
    const timer = window.setTimeout(() => setRemaining((value) => value - 1), 1_000);
    return () => window.clearTimeout(timer);
  }, [open, remaining, sent, sending]);

  useEffect(() => () => clearHold(), []);

  return (
    <>
      <button
        type="button"
        className="sos-button"
        aria-label={copy.safety.hold}
        aria-disabled={!enabled}
        disabled={!enabled}
        onPointerDown={beginHold}
        onPointerUp={clearHold}
        onPointerLeave={clearHold}
        onPointerCancel={clearHold}
        onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') beginHold(); }}
        onKeyUp={clearHold}
        title={enabled ? copy.safety.hold : copy.shell.sosDisabled}
      >{copy.safety.buttonLabel}</button>
      {open && (
        <div className="sheet-backdrop" role="presentation">
          <section className="sheet sos-sheet" role="alertdialog" aria-modal="true" aria-labelledby="sos-title" aria-describedby="sos-description">
            <h2 id="sos-title">{sent ? copy.safety.recorded : copy.safety.dialog}</h2>
            <p id="sos-description">{copy.safety.emergency}</p>
            {!sent && <p aria-live="polite">{sending ? copy.safety.sending : `${copy.safety.countdown} ${remaining} ${copy.safety.countdownSeconds}`}</p>}
            {error && <p role="alert">{error}</p>}
            {sent && <p role="status">{copy.safety.sent}</p>}
            <div className="sheet-actions">
              {sent ? <button type="button" onClick={close}>{copy.safety.closeDetails}</button> : <button type="button" onClick={close}>{copy.safety.cancel}</button>}
              <a href={smsHref}>{copy.safety.sms}</a>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
