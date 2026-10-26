import { copy } from '../copy';
import type { LocationSnapshot } from '../platform/location';
import type { CachedVisit } from '../offline/db';

type LocationState = 'acquiring' | 'good' | 'low_accuracy' | 'denied' | 'unavailable';
type Props = { visit: CachedVisit; location: LocationSnapshot | null; locationState: LocationState; busy: boolean; safetyTimerEnabled: boolean; canEnableSafetyTimer: boolean; onSafetyTimerChange: (enabled: boolean) => void; onConfirm: () => void; onCancel: () => void };
export function ArriveSheet({ visit, location, locationState, busy, safetyTimerEnabled, canEnableSafetyTimer, onSafetyTimerChange, onConfirm, onCancel }: Props) {
  const label = locationState === 'acquiring' ? copy.arrival.acquiring : locationState === 'good' ? `${copy.arrival.found} ${Math.round(location?.accuracy_m ?? 0)} m` : locationState === 'low_accuracy' ? copy.arrival.lowAccuracy : locationState === 'denied' ? copy.arrival.denied : copy.arrival.unavailable;
  return <div className="sheet-backdrop"><section className="sheet" role="dialog" aria-modal="true" aria-labelledby="arrive-title"><h2 id="arrive-title">{copy.arrival.title} {visit.client_display_name}?</h2><p role="status">{label}</p><p>{copy.arrival.optionalLocation}</p>{canEnableSafetyTimer && <label className="check-row safety-timer-toggle"><input type="checkbox" checked={safetyTimerEnabled} onChange={(event) => onSafetyTimerChange(event.target.checked)} /> {copy.arrival.safetyTimer}</label>}<div className="sheet-actions"><button type="button" onClick={onConfirm} disabled={busy}>{busy ? copy.arrival.saving : copy.arrival.confirm}</button><button type="button" className="button-secondary" onClick={onCancel} disabled={busy}>{copy.generic.cancel}</button></div></section></div>;
}
