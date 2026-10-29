import type { FormEvent } from 'react';

type Props = { resolution: string; setResolution: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void; resolveLabel: string; cancelLabel: string };

export function ResolveFlagPanel({ resolution, setResolution, onSubmit, onCancel, resolveLabel, cancelLabel }: Props) {
  return <form className="care-form" onSubmit={onSubmit}>
    <h2>Resolve flag</h2>
    <label>Resolution note<textarea required minLength={3} maxLength={500} value={resolution} onChange={(event) => setResolution(event.target.value)} /></label>
    <button type="submit">{resolveLabel}</button>
    <button type="button" onClick={onCancel}>{cancelLabel}</button>
  </form>;
}
