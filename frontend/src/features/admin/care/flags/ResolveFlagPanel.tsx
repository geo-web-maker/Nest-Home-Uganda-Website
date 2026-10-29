import type { FormEvent } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Field } from '../../../../components/ui/Field';

type Props = { resolution: string; setResolution: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void; resolveLabel: string; cancelLabel: string };

export function ResolveFlagPanel({ resolution, setResolution, onSubmit, onCancel, resolveLabel, cancelLabel }: Props) {
  return <form className="care-form" onSubmit={onSubmit}>
    <h2>Resolve flag</h2>
    <Field label="Resolution note" kind="textarea" required requiredLabel="required" minLength={3} maxLength={500} value={resolution} onChange={(event) => setResolution(event.target.value)} />
    <Button type="submit">{resolveLabel}</Button>
    <Button variant="outline" type="button" onClick={onCancel}>{cancelLabel}</Button>
  </form>;
}
