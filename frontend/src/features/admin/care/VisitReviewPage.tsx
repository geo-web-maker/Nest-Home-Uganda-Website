/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '../../../lib/api/client';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Field } from '../../../components/ui/Field';
import { MapPicker } from './components/MapPicker';
import './care-screen.css';

type Review = {
  visit?: any;
  events?: any[];
  notes?: any[];
  flags?: any[];
  photos?: any[];
  annotations?: any[];
  audit?: any[];
};
export function VisitReviewPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Review | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  async function load() {
    try {
      setData(await apiClient.get<Review>(`/admin/care/visits/${encodeURIComponent(id)}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Visit could not be loaded.');
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (!data)
    return (
      <>
        <PageHeader title="Visit review" />
        <p>{error || 'Loading…'}</p>
      </>
    );
  const eventTimestamp = (event: any) => {
    const value = event.received_at ?? event.server_received_at ?? event.device_time;
    const timestamp = new Date(String(value ?? '')).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  };
  const events = [...(data.events ?? [])].sort((a, b) => eventTimestamp(a) - eventTimestamp(b));
  const pins = events.filter(
    (e) => Number.isFinite(Number(e.lat)) && Number.isFinite(Number(e.lng)),
  );
  return (
    <>
      <PageHeader
        title="Visit review"
        subtitle={`Visit ${id}`}
        actions={
          <Button variant="outline" onClick={() => navigate('/admin/care/visits')}>
            Back
          </Button>
        }
      />
      <section className="care-detail">
        <h2>Timeline</h2>
        {events.map((event, i) => (
          <article key={String(event.id ?? i)} className="care-check">
            <b>{event.type}</b>
            <span>{String(event.received_at ?? event.server_received_at ?? event.device_time ?? '')}</span>
            <small>
              Verification: {String(event.verification ?? 'not recorded')} · Distance:{' '}
              {String(event.distance_m ?? '—')} m
            </small>
          </article>
        ))}
      </section>
      <section className="care-detail">
        <h2>Event map</h2>
        {pins.length ? (
          <MapPicker
            lat={String(pins[0].lat)}
            lng={String(pins[0].lng)}
            radius={String(pins[0].accuracy_m ?? 150)}
            markers={pins.map((p) => ({
              lat: Number(p.lat),
              lng: Number(p.lng),
              label: String(p.type ?? 'event'),
            }))}
            onChange={() => {}}
          />
        ) : (
          <p>No event coordinates are available.</p>
        )}
      </section>
      <section className="care-detail">
        <h2>Notes & annotations</h2>
        {(data.notes ?? []).map((n, i) => (
          <p key={i}>{String(n.body ?? n.comment ?? '')}</p>
        ))}
        {(data.annotations ?? []).map((n, i) => (
          <p key={`a${i}`}>{String(n.comment ?? n.body ?? '')}</p>
        ))}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (note.trim().length < 3) return;
            await apiClient.post(`/admin/care/visits/${encodeURIComponent(id)}/annotate`, {
              comment: note.trim(),
            });
            setNote('');
            await load();
          }}
        >
          <Field
            label="Add annotation"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
            requiredLabel="required"
          />
          <Button type="submit">Save annotation</Button>
        </form>
      </section>
      <section className="care-detail">
        <h2>Flags</h2>
        {(data.flags ?? []).map((f) => (
          <p key={String(f.id)}>
            {String(f.type)} — {String(f.status ?? (f.resolved ? 'resolved' : 'open')).replaceAll('_', ' ')}{f.resolution_note ? ` · ${String(f.resolution_note)}` : ''}
          </p>
        ))}
      </section>
      <section className="care-detail">
        <h2>Photo metadata</h2>
        {(data.photos ?? []).map((p) => (
          <p key={String(p.id)}>
            {String(p.photo_type ?? p.kind ?? 'photo').replaceAll('_', ' ')} · {String(p.status ?? 'registered')}
          </p>
        ))}
      </section>
    </>
  );
}
