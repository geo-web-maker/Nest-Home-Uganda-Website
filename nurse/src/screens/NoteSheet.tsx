import type { FormEvent } from 'react';
import type { CachedVisit } from '../offline/db';
import { copy } from '../copy';

type Props = { visit: CachedVisit; value: string; onChange: (value: string) => void; onSubmit: (event: FormEvent) => void; onCancel: () => void; busy?: boolean };
export function NoteSheet({ visit, value, onChange, onSubmit, onCancel, busy = false }: Props) {
  return <div className="sheet-backdrop"><section className="sheet note-sheet" role="dialog" aria-modal="true" aria-labelledby="note-title"><div className="sheet-handle" aria-hidden="true" /><h2 id="note-title">{copy.visit.note} · {visit.client_display_name}</h2><p>{copy.visit.operationalNotesOnly}</p><form onSubmit={onSubmit} className="stack-form"><label htmlFor="visit-note-body">{copy.notes.label}</label><textarea id="visit-note-body" value={value} onChange={(event) => onChange(event.target.value)} required maxLength={1000} rows={4} /><div className="sheet-actions"><button type="submit" disabled={busy || !value.trim()}>{busy ? copy.notes.saving : copy.generic.save}</button><button type="button" className="button-secondary" onClick={onCancel} disabled={busy}>{copy.generic.cancel}</button></div></form></section></div>;
}
