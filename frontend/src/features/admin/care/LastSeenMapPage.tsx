/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../../components/admin/PageHeader';
import { Button } from '../../../components/ui/Button';
import { apiClient } from '../../../lib/api/client';
import './stage30-38.css';

type LastSeen = { nurse_id: string; visit_id: string; captured_at: string; lat: number; lng: number; accuracy_m?: number; verification?: string; event_type?: string };
const dateTime = (value: unknown) => { const d = new Date(String(value ?? '')); return Number.isNaN(d.getTime()) ? 'Time not recorded' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d); };

export function LastSeenMapPage() {
  const [rows, setRows] = useState<LastSeen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mapRequested, setMapRequested] = useState(false);
  const [focusNurse, setFocusNurse] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const result: any = await apiClient.get('/admin/care/last-seen'); setRows(Array.isArray(result) ? result : result.items ?? []); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Last-seen positions could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const points = useMemo(() => rows.filter((row) => Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lng)) && Math.abs(Number(row.lat)) <= 90 && Math.abs(Number(row.lng)) <= 180), [rows]);
  const focused = points.find((row) => row.nurse_id === focusNurse);
  const bounds = useMemo(() => {
    const source = focused ? [focused] : points;
    if (!source.length) return null;
    const lats = source.map((row) => Number(row.lat)); const lngs = source.map((row) => Number(row.lng));
    const latDelta = Math.max(0.008, (Math.max(...lats) - Math.min(...lats)) * .15);
    const lngDelta = Math.max(0.008, (Math.max(...lngs) - Math.min(...lngs)) * .15);
    return { west: Math.min(...lngs) - lngDelta, east: Math.max(...lngs) + lngDelta, south: Math.min(...lats) - latDelta, north: Math.max(...lats) + latDelta };
  }, [focused, points]);
  const mapMarker = focused ?? points[0];
  const mapUrl = bounds ? `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${bounds.west},${bounds.south},${bounds.east},${bounds.north}`)}&layer=mapnik${mapMarker ? `&marker=${encodeURIComponent(`${Number(mapMarker.lat)},${Number(mapMarker.lng)}`)}` : ''}` : '';
  return <div className="stage-page">
    <PageHeader title="Last-seen staff positions" subtitle="Most recent accepted visit-event location available to your account. This is not live device tracking." actions={<Button variant="outline" disabled={loading} onClick={() => void load()}>Refresh</Button>} />
    <div className="stage-callout"><strong>Privacy notice</strong><p>Positions come from a recorded visit event, not continuous background tracking. Map tiles are not loaded until you select “Load map”; loading them sends the displayed coordinate area to OpenStreetMap. Coordinates are never sent to a third-party map automatically.</p></div>
    {error && <div className="stage-message stage-message--error" role="alert">{error}</div>}
    <section className="stage-panel"><div className="stage-toolbar"><div><h2>Recorded positions</h2><p className="stage-label-note">{loading ? 'Loading…' : `${points.length} position${points.length === 1 ? '' : 's'} returned by the server`}</p></div><div className="stage-toolbar-actions"><Button variant="outline" disabled={!points.length} onClick={() => { setMapRequested(false); setFocusNurse(''); }}>Clear map selection</Button><Button disabled={!points.length} onClick={() => setMapRequested(true)}>Load map</Button></div></div>
      {points.length === 0 && !loading ? <p className="stage-empty">No coordinates are available in the permitted record set. A check-in without a location is intentionally not shown as a position.</p> : <div className="stage-map-points">{points.map((row) => <article className="stage-map-point" key={`${row.nurse_id}:${row.visit_id}:${row.captured_at}`}><div><strong>{row.nurse_id}</strong><p>Recorded: {dateTime(row.captured_at)}</p><p>Visit: {row.visit_id} · Accuracy: {row.accuracy_m == null ? 'not provided' : `${Math.round(Number(row.accuracy_m))} m`} · Verification: {row.verification ?? 'not provided'}</p><p>Coordinates: {Number(row.lat).toFixed(5)}, {Number(row.lng).toFixed(5)}</p></div><Button variant="outline" onClick={() => { setFocusNurse(row.nurse_id); setMapRequested(false); }}>Focus</Button></article>)}</div>}
    </section>
    {mapRequested && mapUrl && <section className="stage-panel"><h2>Map of recorded coordinates</h2><p className="stage-label-note">Map provider: OpenStreetMap. The selected nurse (or first listed coordinate) appears as a map marker; the full location list remains beside the map. This is a view of a recorded event, not the staff member’s current location.</p><iframe className="stage-map" title="OpenStreetMap map of last-seen staff coordinates" src={mapUrl} loading="lazy" referrerPolicy="no-referrer" /></section>}
    {focusNurse && !mapRequested && <div className="stage-message" role="status">Selected {focusNurse}. Select “Load map” to send this coordinate area to OpenStreetMap.</div>}
  </div>;
}
