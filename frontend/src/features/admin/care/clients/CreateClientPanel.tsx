import type { FormEvent } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Field } from '../../../../components/ui/Field';

type Props = { name: string; setName: (value: string) => void; notes: string; setNotes: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; createLabel: string };

export function CreateClientPanel({ name, setName, notes, setNotes, onSubmit, createLabel }: Props) {
  return <form className="care-form" onSubmit={onSubmit}>
    <h2>Create client</h2>
    <Field label="Client display name" required requiredLabel="required" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
    <Field label="Notes for nurse" kind="textarea" maxLength={280} value={notes} onChange={(event) => setNotes(event.target.value)} />
    <Button type="submit">{createLabel}</Button>
  </form>;
}
