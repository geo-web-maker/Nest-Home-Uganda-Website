import type { FormEvent } from 'react';
import { Button } from '../../../../components/ui/Button';
import { Field } from '../../../../components/ui/Field';

type Props = {
  clientId: string; setClientId: (value: string) => void;
  nurseId: string; setNurseId: (value: string) => void;
  placeId: string; setPlaceId: (value: string) => void;
  start: string; setStart: (value: string) => void;
  end: string; setEnd: (value: string) => void;
  instructions: string; setInstructions: (value: string) => void;
  busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

/** Schedule form extracted without changing the parent-owned save handler. */
export function ScheduleVisitPanel(props: Props) {
  return <form className="care-form" onSubmit={props.onSubmit}>
    <h2>Schedule a visit</h2>
    <p>Use IDs from the client, nurse, and place records. The server validates assignment, place ownership, and scheduling conflicts.</p>
    <Field label="Client ID" required requiredLabel="required" value={props.clientId} onChange={(event) => props.setClientId(event.target.value)} />
    <Field label="Nurse user ID" required requiredLabel="required" value={props.nurseId} onChange={(event) => props.setNurseId(event.target.value)} />
    <Field label="Place ID" required requiredLabel="required" value={props.placeId} onChange={(event) => props.setPlaceId(event.target.value)} />
    <Field label="Start time" required requiredLabel="required" type="datetime-local" value={props.start} onChange={(event) => props.setStart(event.target.value)} />
    <Field label="End time" required requiredLabel="required" type="datetime-local" value={props.end} onChange={(event) => props.setEnd(event.target.value)} />
    <Field label="Instructions for nurse" kind="textarea" maxLength={1000} value={props.instructions} onChange={(event) => props.setInstructions(event.target.value)} />
    <Button type="submit" disabled={props.busy}>Schedule visit</Button>
  </form>;
}
