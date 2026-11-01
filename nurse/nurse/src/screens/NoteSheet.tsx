import type { FormEvent } from 'react';
import type { CachedVisit } from '../offline/db';
import { copy } from '../copy';
import { PillButton } from '../ui/PillButton';
import { Sheet, SheetActions } from '../ui/Sheet';

type Props = { visit: CachedVisit; value: string; onChange: (value: string) => void; onSubmit: (event: FormEvent) => void; onCancel: () => void; busy?: boolean };
export function NoteSheet({ visit, value, onChange, onSubmit, onCancel, busy = false }: Props) {
  return <Sheet labelledBy="note-title" className="note-sheet">
    <h2 id="note-title">{copy.visit.note} · {visit.client_display_name}</h2>
    <p>{copy.visit.operationalNotesOnly}</p>
    <form onSubmit={onSubmit} className="stack-form">
      <label htmlFor="visit-note-body">{copy.notes.label}</label>
      <textarea id="visit-note-body" value={value} onChange={(event) => onChange(event.target.value)} required maxLength={1000} rows={4} />
      <SheetActions>
        <PillButton type="submit" tone="forest" size="full" disabled={busy || !value.trim()}>{busy ? copy.notes.saving : copy.generic.save}</PillButton>
        <PillButton type="button" tone="ghost" size="full" showArrow={false} onClick={onCancel} disabled={busy}>{copy.generic.cancel}</PillButton>
      </SheetActions>
    </form>
  </Sheet>;
}
