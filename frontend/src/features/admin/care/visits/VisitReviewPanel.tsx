import { Field } from '../../../../components/ui/Field';
import type { FormEvent, Dispatch, SetStateAction } from 'react';
import { Button } from '../../../../components/ui/Button';
type Row = Record<string, unknown>;
type VisitReview = { visit?: Row; events?: Row[]; notes?: Row[]; flags?: Row[]; photos?: Row[]; annotations?: Row[]; audit?: Row[] };
type Props = {
  visitId: string; review: VisitReview | null; loading: boolean; busy: boolean;
  photoPanelOpen: boolean; setPhotoPanelOpen: Dispatch<SetStateAction<boolean>>;
  annotation: string; setAnnotation: (value: string) => void;
  onClose: () => void;
  onResolveFlag: (flagId: string) => void;
  onSaveAnnotation: (event: FormEvent<HTMLFormElement>) => void;
  printable: (value: unknown) => string;
};

/** The visit evidence/review panel. Network actions remain owned by CareWorkspace. */
export function VisitReviewPanel(props: Props) {
  const { review, printable } = props;
  return <section className="care-review" aria-labelledby="visit-review-title">
    <header className="care-review-header">
      <div><h2 id="visit-review-title">Visit review</h2><p>Visit ID: {props.visitId}</p></div>
      <Button type="button" variant="outline" onClick={props.onClose}>Close review</Button>
    </header>
    {props.loading && <p role="status">Loading visit timeline and audit details.</p>}
    {review?.visit && <>
      <dl className="care-review-summary">
        {(['status', 'nurse_id', 'client_id', 'scheduled_start', 'scheduled_end', 'adhoc'] as const).map((key) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{printable(review.visit?.[key])}</dd></div>)}
      </dl>
      <section aria-labelledby="visit-events-title"><h3 id="visit-events-title">Visit timeline</h3>
        {[...(review.events ?? [])].sort((a, b) => String(a.at ?? a.created_at ?? '').localeCompare(String(b.at ?? b.created_at ?? ''))).length === 0 ? <p>No visit events are recorded.</p> : <ol className="care-timeline">
          {[...(review.events ?? [])].sort((a, b) => String(a.at ?? a.created_at ?? '').localeCompare(String(b.at ?? b.created_at ?? ''))).map((item, index) => <li key={String(item.id ?? `${item.type ?? 'event'}-${index}`)}>
            <strong>{String(item.type ?? item.event_type ?? 'Visit event')}</strong><time>{printable(item.at ?? item.created_at)}</time><p>{String(item.verification ?? item.status ?? '')}</p>
          </li>)}
        </ol>}
      </section>
      <section aria-labelledby="visit-notes-title"><h3 id="visit-notes-title">Nurse notes</h3>
        {(review.notes ?? []).length ? <ul>{review.notes?.map((item, index) => <li key={String(item.id ?? index)}>{String(item.body ?? item.note ?? item.text ?? 'Note')} <small>{printable(item.created_at ?? item.at)}</small></li>)}</ul> : <p>No notes are recorded.</p>}
      </section>
      <section aria-labelledby="visit-flags-title"><h3 id="visit-flags-title">Flags</h3>
        {(review.flags ?? []).length ? <ul>{review.flags?.map((item, index) => <li key={String(item.id ?? index)}>
          {String(item.reason ?? item.type ?? 'Visit flag')} · {String(item.status ?? 'open')} {item.status === 'open' && <Button type="button" variant="outline" disabled={props.busy} onClick={() => props.onResolveFlag(String(item.id ?? ''))}>Resolve flag</Button>}
        </li>)}</ul> : <p>No flags are recorded.</p>}
      </section>
      <section aria-labelledby="visit-photos-title"><h3 id="visit-photos-title">Photos</h3>
        <Button type="button" variant="outline" aria-expanded={props.photoPanelOpen} onClick={() => props.setPhotoPanelOpen((open) => !open)}>{props.photoPanelOpen ? 'Hide photo records' : 'Open photo records'} ({review.photos?.length ?? 0})</Button>
        {props.photoPanelOpen && <div className="care-photo-records">{(review.photos ?? []).length ? review.photos?.map((photo, index) => <article key={String(photo.id ?? index)}>
          <strong>Photo record {String(photo.id ?? index + 1)}</strong><p>Status: {printable(photo.status)}</p><p>Added: {printable(photo.created_at)}</p>
          <p>Image preview is unavailable until the audited private image endpoint is implemented.</p>
        </article>) : <p>No photo records are attached to this visit.</p>}</div>}
      </section>
      <section aria-labelledby="visit-annotations-title"><h3 id="visit-annotations-title">Annotations</h3>
        {(review.annotations ?? []).map((item, index) => <p key={String(item.id ?? index)}>{String(item.comment ?? '')} <small>{printable(item.created_at ?? item.at)}</small></p>)}
        <form className="care-form" onSubmit={props.onSaveAnnotation}><Field kind="textarea" label="Add annotation" required requiredLabel="required" minLength={3} maxLength={1000} value={props.annotation} onChange={(event) => props.setAnnotation(event.target.value)} />
          <Button type="submit" disabled={props.busy || props.annotation.trim().length < 3}>Save annotation</Button>
        </form>
      </section>
      <section aria-labelledby="visit-audit-title"><h3 id="visit-audit-title">Audit trail</h3>
        {(review.audit ?? []).length ? <ol>{review.audit?.map((item, index) => <li key={String(item.id ?? index)}>{String(item.action ?? item.event ?? 'Recorded action')} · {printable(item.at ?? item.created_at)} · {printable(item.actor_id ?? item.user_id)}</li>)}</ol> : <p>No audit entries are attached to this visit.</p>}
      </section>
    </>}
  </section>;
}
