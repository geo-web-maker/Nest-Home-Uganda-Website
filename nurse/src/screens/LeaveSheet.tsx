import { copy } from '../copy';
import type { CachedVisit } from '../offline/db';
import { Banner } from '../ui/Banner';
import { PillButton } from '../ui/PillButton';
import { Sheet, SheetActions } from '../ui/Sheet';
import { Timer } from '../ui/Timer';

type Props = { visit: CachedVisit; finalNote: string; busy: boolean; onFinalNote: (value: string) => void; onConfirm: () => void; onCancel: () => void; onAddPhoto: () => void; canAddRequiredPhoto?: boolean; requiredPhotoMissing?: boolean };

export function LeaveSheet({ visit, finalNote, busy, onFinalNote, onConfirm, onCancel, onAddPhoto, canAddRequiredPhoto = true, requiredPhotoMissing = false }: Props) {
  const startedAt = visit.check_in_at ?? visit.scheduled_start;
  return <Sheet labelledBy="leave-title" className="departure-sheet">
      <p className="eyebrow">{copy.departure.eyebrow}</p>
      <h2 id="leave-title">{copy.departure.title} {visit.client_display_name}?</h2>
      <div className="mk-leave-total">
        <span>{copy.departure.totalTime}</span>
        <Timer startedAt={startedAt} size="lg" />
      </div>
      <label htmlFor="leave-note">{copy.departure.finalNote}</label>
      <textarea id="leave-note" value={finalNote} onChange={(event) => onFinalNote(event.target.value)} maxLength={1000} rows={3} placeholder={copy.departure.notePlaceholder} />
      {requiredPhotoMissing
        ? <Banner tone="warn" role="alert">{canAddRequiredPhoto ? copy.departure.requiredPhoto : copy.departure.requiredPhotoUnavailable}</Banner>
        : <p className="muted">{copy.departure.savedOffline}</p>}
      <SheetActions>
        {requiredPhotoMissing && canAddRequiredPhoto && <PillButton type="button" tone="ghost" size="full" onClick={onAddPhoto} disabled={busy} showArrow={false}>{copy.departure.addRequiredPhoto}</PillButton>}
        <PillButton type="button" tone="forest" size="full" onClick={onConfirm} disabled={busy || requiredPhotoMissing}>{busy ? copy.departure.saving : copy.departure.confirm}</PillButton>
        <PillButton type="button" tone="ghost" size="full" onClick={onCancel} disabled={busy} showArrow={false}>{copy.generic.cancel}</PillButton>
      </SheetActions>
  </Sheet>;
}
