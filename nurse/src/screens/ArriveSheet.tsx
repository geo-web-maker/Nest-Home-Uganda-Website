import { copy } from '../copy';
import type { LocationSnapshot } from '../platform/location';
import type { CachedVisit } from '../offline/db';
import { Chip, type ChipKind } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { PillButton } from '../ui/PillButton';
import { Sheet, SheetActions } from '../ui/Sheet';

type LocationState = 'acquiring' | 'good' | 'low_accuracy' | 'denied' | 'unavailable';
type Props = { visit: CachedVisit; location: LocationSnapshot | null; locationState: LocationState; busy: boolean; safetyTimerEnabled: boolean; canEnableSafetyTimer: boolean; onSafetyTimerChange: (enabled: boolean) => void; onConfirm: () => void; onCancel: () => void };

const locationPresentation: Record<LocationState, { kind: ChipKind; label: string }> = {
  acquiring: { kind: 'pd', label: copy.arrival.finding },
  good: { kind: 'ok', label: copy.arrival.ready },
  low_accuracy: { kind: 'rv', label: copy.arrival.lowAccuracyShort },
  denied: { kind: 'bad', label: copy.arrival.deniedShort },
  unavailable: { kind: 'bad', label: copy.arrival.unavailableShort },
};

export function ArriveSheet({ visit, location, locationState, busy, safetyTimerEnabled, canEnableSafetyTimer, onSafetyTimerChange, onConfirm, onCancel }: Props) {
  const presentation = locationPresentation[locationState];
  const detail = locationState === 'good'
    ? `${copy.arrival.found} ${Math.round(location?.accuracy_m ?? 0)} m`
    : locationState === 'acquiring'
      ? copy.arrival.acquiring
      : locationState === 'low_accuracy'
        ? copy.arrival.lowAccuracy
        : locationState === 'denied'
          ? copy.arrival.denied
          : copy.arrival.unavailable;

  return <Sheet labelledBy="arrive-title" className="arrival-sheet">
      <p className="eyebrow">{copy.arrival.eyebrow}</p>
      <h2 id="arrive-title">{copy.arrival.title} {visit.client_display_name}?</h2>
      <div className="mk-arrival-location">
        <span className="mk-arrival-location-icon" aria-hidden="true"><Icon name="pin" size={19} /></span>
        <div className="mk-arrival-location-copy">
          <span className="mk-arrival-location-label">{copy.arrival.locationCheck}</span>
          <span role="status">{detail}</span>
        </div>
        <Chip kind={presentation.kind}>{presentation.label}</Chip>
      </div>
      <p className="muted">{copy.arrival.optionalLocation}</p>
      {canEnableSafetyTimer && <label className="check-row safety-timer-toggle mk-safety-toggle">
        <input role="switch" type="checkbox" checked={safetyTimerEnabled} onChange={(event) => onSafetyTimerChange(event.target.checked)} />
        <span className="mk-safety-toggle-track" aria-hidden="true" />
        <span>{copy.arrival.safetyTimer}</span>
      </label>}
      <SheetActions>
        <PillButton tone="gold" size="full" onClick={onConfirm} disabled={busy}>{busy ? copy.arrival.saving : copy.arrival.confirm}</PillButton>
        <PillButton tone="ghost" size="full" onClick={onCancel} disabled={busy} showArrow={false}>{copy.generic.cancel}</PillButton>
      </SheetActions>
  </Sheet>;
}
