import type { FormEvent } from 'react';

type Props = { name: string; setName: (value: string) => void; notes: string; setNotes: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; createLabel: string };

export function CreateClientPanel({ name, setName, notes, setNotes, onSubmit, createLabel }: Props) {
  return <form className="care-form" onSubmit={onSubmit}>
    <h2>Create client</h2>
    <label>Client display name<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label>Notes for nurse<textarea maxLength={280} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
    <button type="submit">{createLabel}</button>
  </form>;
}
