import { useEffect, useState } from 'react';
import type { CachedVisit } from '../offline/db';
import { copy } from '../copy';
import { PillButton } from '../ui/PillButton';
import { Sheet, SheetActions } from '../ui/Sheet';

type Props = { visit?: CachedVisit; onOpenVisit: (visit: CachedVisit) => void };

function dismissalKey(visit: CachedVisit) {
  return `nest.nurse.safety-prompt-dismissed:${visit.id}:${visit.safety_timer_until ?? ''}`;
}

/** Foreground-only deadline prompt. Dismissing it is local acknowledgement, not a server safety confirmation. */
export function SafetyTimerPrompt({ visit, onOpenVisit }: Props) {
  const deadline = visit?.safety_timer_until ? Date.parse(visit.safety_timer_until) : NaN;
  const eligible = Boolean(visit && (visit.status === 'in_progress' || visit.safety_checkout_pending) && visit.safety_state === 'armed' && Number.isFinite(deadline));
  const [now, setNow] = useState(Date.now());
  const [dismissed, setDismissed] = useState(() => Boolean(visit && localStorage.getItem(dismissalKey(visit)) === 'true'));

  useEffect(() => {
    if (!eligible || dismissed) return;
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [eligible, dismissed, visit?.id, visit?.safety_timer_until]);

  useEffect(() => {
    setDismissed(Boolean(visit && localStorage.getItem(dismissalKey(visit)) === 'true'));
  }, [visit?.id, visit?.safety_timer_until]);

  if (!eligible || !visit || now < deadline || dismissed) return null;

  const activeVisit = visit;
  function dismiss() {
    localStorage.setItem(dismissalKey(activeVisit), 'true');
    setDismissed(true);
  }

  return <Sheet role="alertdialog" labelledBy="safety-timer-title" className="safety-timer-prompt" backdropClassName="safety-timer-backdrop">
    <p className="eyebrow">{copy.safety.timerEyebrow}</p>
    <h2 id="safety-timer-title">{copy.safety.timerTitle}</h2>
    <p>{visit.safety_timer_sync_state === 'confirmed' ? copy.safety.timerStillArmed : copy.safety.timerPendingSync}</p>
    <p>{copy.safety.timerSafe}</p>
    <SheetActions>
      <PillButton type="button" tone="forest" size="full" onClick={() => { dismiss(); onOpenVisit(visit); }}>{copy.safety.timerReview}</PillButton>
      <PillButton type="button" tone="ghost" size="full" showArrow={false} onClick={dismiss}>{copy.safety.timerDismiss}</PillButton>
    </SheetActions>
  </Sheet>;
}
