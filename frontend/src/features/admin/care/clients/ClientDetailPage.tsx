import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../../components/ui/Button';
import { Field } from '../../../../components/ui/Field';
import { ApiError, apiClient } from '../../../../lib/api/client';
import { MapPicker } from '../components/MapPicker';
import { CareSheet } from '../components/CareSheet';
import { hasScopes } from '../../auth/hasScopes';
import { useAuth } from '../../auth/useAuth';
import '../care.css';
import './client-detail.css';

type Client = {
  id: string;
  display_name: string;
  notes_for_nurse?: string;
  status?: string;
  supervisor_id?: string | null;
  assigned_nurse_ids?: string[];
  photo_allowed?: boolean;
  photo_required?: 'none' | 'arrival' | 'departure' | 'either' | 'both' | null;
  photo_guidance_text?: string | null;
};
type Place = {
  id: string;
  label?: string;
  address_text?: string;
  lat?: number;
  lng?: number;
  radius_m?: number;
  is_primary?: boolean;
};
type Stay = { id: string; place_id: string; starts_on: string; ends_on?: string | null };

const PHOTO_REQUIREMENTS = [
  ['none', 'No photo required'],
  ['arrival', 'At arrival'],
  ['departure', 'At departure'],
  ['either', 'At arrival or departure'],
  ['both', 'At arrival and departure'],
] as const;

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function ClientDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEditClient = hasScopes(user, ['clients:write']);
  const canReadPlaces = hasScopes(user, ['places:read']);
  const canCreatePlace = hasScopes(user, ['places:write']);
  const canEditPlace = canEditClient;
  const canMoveClient = canEditClient;
  const canReadMapConfig = hasScopes(user, ['carecfg:read']);
  const [client, setClient] = useState<Client | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [mapTileUrl, setMapTileUrl] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [notes, setNotes] = useState('');
  const [photoAllowed, setPhotoAllowed] = useState(false);
  const [photoRequired, setPhotoRequired] = useState('none');
  const [photoGuidance, setPhotoGuidance] = useState('');
  const [editingPlaceId, setEditingPlaceId] = useState('');
  const [placeLabel, setPlaceLabel] = useState('Home');
  const [placeAddress, setPlaceAddress] = useState('');
  const [coords, setCoords] = useState({ lat: '', lng: '', radius: '150' });
  const [moveOpen, setMoveOpen] = useState(false);
  const [movePlaceId, setMovePlaceId] = useState('');
  const [moveStart, setMoveStart] = useState(localDate());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [placesError, setPlacesError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    setPlacesError('');
    try {
      const value = await apiClient.get<Client>(`/admin/care/clients/${encodeURIComponent(id)}`);
      setClient(value);
      setDisplayName(value.display_name ?? '');
      setNotes(value.notes_for_nurse ?? '');
      setPhotoAllowed(Boolean(value.photo_allowed));
      setPhotoRequired(value.photo_required ?? 'none');
      setPhotoGuidance(value.photo_guidance_text ?? '');
      if (canReadPlaces) {
        try {
          const [placeResult, stayResult] = await Promise.all([
            apiClient.get<{ items?: Place[] }>(`/admin/care/clients/${encodeURIComponent(id)}/places`),
            apiClient.get<{ items?: Stay[] }>(`/admin/care/clients/${encodeURIComponent(id)}/stays`),
          ]);
          setPlaces(Array.isArray(placeResult.items) ? placeResult.items : []);
          setStays(Array.isArray(stayResult.items) ? stayResult.items : []);
        } catch (reason) {
          setPlaces([]);
          setStays([]);
          setPlacesError(reason instanceof Error ? reason.message : 'Place history could not be loaded.');
        }
      } else {
        setPlaces([]);
        setStays([]);
      }
      if (canReadMapConfig) {
        try {
          const settings = await apiClient.get<{ items?: Array<{ id: string; value: unknown }> }>('/admin/care/settings');
          const map = settings.items?.find((item) => item.id === 'care.map_tile_url');
          setMapTileUrl(typeof map?.value === 'string' ? map.value : '');
        } catch {
          setMapTileUrl('');
        }
      }
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : 'Client details could not be loaded.');
      setClient(null);
    } finally {
      setLoading(false);
    }
  }, [id, canReadPlaces, canReadMapConfig]);

  useEffect(() => { void load(); }, [load]);

  const placeById = useMemo(() => new Map(places.map((place) => [place.id, place])), [places]);
  const resetPlaceEditor = () => {
    setEditingPlaceId('');
    setPlaceLabel('Home');
    setPlaceAddress('');
    setCoords({ lat: '', lng: '', radius: '150' });
  };

  function editPlace(place: Place) {
    setEditingPlaceId(place.id);
    setPlaceLabel(place.label ?? 'Home');
    setPlaceAddress(place.address_text ?? '');
    setCoords({ lat: String(place.lat ?? ''), lng: String(place.lng ?? ''), radius: String(place.radius_m ?? 150) });
  }

  async function saveClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      await apiClient.patch(`/admin/care/clients/${encodeURIComponent(id)}`, {
        display_name: displayName.trim(),
        notes_for_nurse: notes.trim(),
        photo_allowed: photoAllowed,
        photo_required: photoRequired,
        photo_guidance_text: photoGuidance.trim() || null,
      });
      setNotice('Client details saved and audited.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Client details could not be saved.');
    } finally { setBusy(false); }
  }

  async function savePlace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id || !placeLabel.trim() || !placeAddress.trim()) return;
    const lat = Number(coords.lat);
    const lng = Number(coords.lng);
    const radius = Number(coords.radius);
    if (!coords.lat.trim() || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      setError('Enter a latitude between -90 and 90.');
      return;
    }
    if (!coords.lng.trim() || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      setError('Enter a longitude between -180 and 180.');
      return;
    }
    if (!coords.radius.trim() || !Number.isFinite(radius) || radius < 50 || radius > 1000) {
      setError('Enter a radius between 50 and 1000 metres.');
      return;
    }
    setBusy(true); setError(''); setNotice('');
    const body = {
      label: placeLabel.trim(), address_text: placeAddress.trim(),
      lat, lng, radius_m: Math.round(radius),
      is_primary: !places.some((place) => place.is_primary),
    };
    try {
      if (editingPlaceId) {
        await apiClient.patch(`/admin/care/places/${encodeURIComponent(editingPlaceId)}`, body);
      } else {
        await apiClient.post(`/admin/care/clients/${encodeURIComponent(id)}/places`, { id: crypto.randomUUID(), ...body });
      }
      resetPlaceEditor();
      setNotice(editingPlaceId ? 'Location updated.' : 'Location created.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Location could not be saved.');
    } finally { setBusy(false); }
  }

  async function moveClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!movePlaceId || !moveStart) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await apiClient.post(`/admin/care/clients/${encodeURIComponent(id)}/stays`, {
        id: crypto.randomUUID(), place_id: movePlaceId, starts_on: moveStart,
      });
      setMoveOpen(false);
      setNotice('Move recorded. The server closes the previous stay and preserves history.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The client move could not be saved.');
    } finally { setBusy(false); }
  }

  if (loading) return <section className="admin-page"><p role="status">Loading client details…</p></section>;
  if (!client) return <section className="admin-page"><div role="alert">{error || 'Client not found.'}</div><Button variant="outline" onClick={() => navigate('/admin/care/clients')}>Back to clients</Button></section>;

  return (
    <section className="admin-page client-detail" aria-labelledby="client-detail-title">
      <header className="page-header">
        <div><p className="eyebrow">Client profile</p><h1 id="client-detail-title">{client.display_name}</h1><p>{client.id} · {client.status ?? 'active'}</p></div>
        <Button variant="outline" onClick={() => navigate('/admin/care/clients')}>Back to clients</Button>
      </header>
      {error && <p className="care-error" role="alert">{error}</p>}
      {notice && <p className="care-notice" role="status">{notice}</p>}
      <form className="care-form client-profile-form" onSubmit={saveClient}>
        <h2>Profile and care notes</h2>
        <Field label="Client display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required requiredLabel="required" maxLength={120} disabled={!canEditClient} />
        <Field kind="textarea" label="Notes for nurse" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={280} disabled={!canEditClient} />
        <label className="client-check"><input type="checkbox" checked={photoAllowed} onChange={(event) => setPhotoAllowed(event.target.checked)} disabled={!canEditClient} /> Photo evidence is permitted for this client</label>
        <Field kind="select" label="Required photo evidence" value={photoRequired} onChange={(event) => setPhotoRequired(event.target.value)} disabled={!canEditClient}>
          {PHOTO_REQUIREMENTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Field>
        <Field kind="textarea" label="Photo guidance for nurse" value={photoGuidance} onChange={(event) => setPhotoGuidance(event.target.value)} maxLength={2000} disabled={!canEditClient} />
        {canEditClient && <Button type="submit" disabled={busy}>Save client details</Button>}
      </form>

      <section className="care-form" aria-labelledby="client-places-title">
        <div className="client-section-heading"><h2 id="client-places-title">Places and stays</h2>{canMoveClient && canReadPlaces && <Button variant="outline" onClick={() => { setMovePlaceId(places[0]?.id ?? ''); setMoveOpen(true); }}>Move client</Button>}</div>
        {!canReadPlaces && <p>Place history is available to users with the places:read permission.</p>}
        {placesError && <p role="alert">{placesError}</p>}
        {canReadPlaces && (
          <>
            <div className="client-place-grid">
              {places.map((place) => (
                <article className="client-place-card" key={place.id}>
                  <div><h3>{place.label ?? 'Place'}{place.is_primary ? ' · Primary' : ''}</h3><p>{place.address_text}</p><p>Radius: {place.radius_m ?? 150} m</p><small>{place.lat}, {place.lng}</small></div>
                  {canEditPlace && <Button variant="outline" onClick={() => editPlace(place)}>Edit location</Button>}
                </article>
              ))}
            </div>
            {places.length === 0 && <p>No places recorded for this client.</p>}
            {(canCreatePlace || (canEditPlace && editingPlaceId)) && (
              <form className="care-form client-location-editor" onSubmit={savePlace}>
                <h3>{editingPlaceId ? 'Edit location' : 'Add location'}</h3>
                <Field label="Place label" value={placeLabel} onChange={(event) => setPlaceLabel(event.target.value)} required requiredLabel="required" maxLength={80} />
                <Field label="Address" value={placeAddress} onChange={(event) => setPlaceAddress(event.target.value)} required requiredLabel="required" maxLength={300} />
                <MapPicker tileUrl={mapTileUrl} lat={coords.lat} lng={coords.lng} radius={coords.radius} onChange={setCoords} />
                <div className="client-form-actions"><Button type="submit" disabled={busy || (!canCreatePlace && !editingPlaceId)}>Save location</Button>{editingPlaceId && <Button type="button" variant="outline" onClick={resetPlaceEditor}>Cancel edit</Button>}</div>
              </form>
            )}
            <div className="client-stay-history"><h3>Stay history</h3>
              {stays.length === 0 ? <p>No stays recorded.</p> : [...stays].sort((a, b) => a.starts_on.localeCompare(b.starts_on)).map((stay) => (
                <article className="client-stay" key={stay.id}>
                  <span className={`client-stay-dot${stay.ends_on ? '' : ' is-current'}`} aria-hidden="true" />
                  <div><strong>{placeById.get(stay.place_id)?.label ?? stay.place_id}</strong><p>{stay.starts_on} – {stay.ends_on ?? 'Current stay'}</p></div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
      {moveOpen && <CareSheet title="Move client" onClose={() => setMoveOpen(false)}>
        <form className="care-form" onSubmit={moveClient}>
          <p>The prior stay is closed by the server; previous stays remain in the timeline.</p>
          <Field kind="select" label="New place" value={movePlaceId} onChange={(event) => setMovePlaceId(event.target.value)} required requiredLabel="required">
            <option value="">Choose a place</option>{places.map((place) => <option key={place.id} value={place.id}>{place.label ?? place.id}</option>)}
          </Field>
          <Field label="Move effective date" type="date" value={moveStart} onChange={(event) => setMoveStart(event.target.value)} required requiredLabel="required" />
          <Button type="submit" disabled={busy || !movePlaceId}>Record move</Button>
        </form>
      </CareSheet>}
      <p><Link to="/admin/care/places">Open place management</Link></p>
    </section>
  );
}
