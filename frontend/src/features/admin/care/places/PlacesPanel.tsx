import type { FormEvent } from 'react';

type Row = Record<string, unknown>;
type Props = {
  clients: Row[];
  clientId: string;
  setClientId: (value: string) => void;
  places: Row[];
  stays: Row[];
  label: string;
  setLabel: (value: string) => void;
  address: string;
  setAddress: (value: string) => void;
  lat: string;
  setLat: (value: string) => void;
  lng: string;
  setLng: (value: string) => void;
  radius: string;
  setRadius: (value: string) => void;
  stayPlaceId: string;
  setStayPlaceId: (value: string) => void;
  stayStart: string;
  setStayStart: (value: string) => void;
  busy: boolean;
  onCreatePlace: (event: FormEvent<HTMLFormElement>) => void;
  onMoveClient: (event: FormEvent<HTMLFormElement>) => void;
};

/** Places/stays form extracted from CareWorkspace; state and API behavior remain in the parent. */
export function PlacesPanel(props: Props) {
  return (
    <section className="care-form" aria-labelledby="place-management-title">
      <h2 id="place-management-title">Places and client stays</h2>
      <label htmlFor="place-client">
        Client
        <select id="place-client" value={props.clientId} onChange={(event) => props.setClientId(event.target.value)}>
          <option value="">Choose a client</option>
          {props.clients.map((item) => <option key={String(item.id)} value={String(item.id)}>{String(item.display_name ?? item.id)}</option>)}
        </select>
      </label>
      {props.clientId && <>
        <form onSubmit={props.onCreatePlace} className="care-form">
          <h3>Add place</h3>
          <label>Place label<input required maxLength={80} value={props.label} onChange={(event) => props.setLabel(event.target.value)} /></label>
          <label>Address<input required maxLength={300} value={props.address} onChange={(event) => props.setAddress(event.target.value)} /></label>
          <label>Latitude<input required type="number" min="-90" max="90" step="any" value={props.lat} onChange={(event) => props.setLat(event.target.value)} /></label>
          <label>Longitude<input required type="number" min="-180" max="180" step="any" value={props.lng} onChange={(event) => props.setLng(event.target.value)} /></label>
          <label>Verification radius in metres<input required type="number" min="50" max="1000" value={props.radius} onChange={(event) => props.setRadius(event.target.value)} /></label>
          <button type="submit" disabled={props.busy}>Save place</button>
        </form>
        <h3>Existing places</h3>
        {props.places.map((place) => <article className="visit-card" key={String(place.id)}>
          <strong>{String(place.label ?? 'Place')}</strong><p>{String(place.address_text ?? '')}</p><p>Place ID: {String(place.id)}</p>
          <button type="button" onClick={() => props.setStayPlaceId(String(place.id))}>Use for new stay</button>
        </article>)}
        <form onSubmit={props.onMoveClient} className="care-form">
          <h3>Move client</h3>
          <label>New place<select required value={props.stayPlaceId} onChange={(event) => props.setStayPlaceId(event.target.value)}>
            <option value="">Choose a place</option>
            {props.places.map((place) => <option key={String(place.id)} value={String(place.id)}>{String(place.label ?? place.id)}</option>)}
          </select></label>
          <label>Stay begins on<input required type="date" value={props.stayStart} onChange={(event) => props.setStayStart(event.target.value)} /></label>
          <button type="submit" disabled={props.busy || !props.stayPlaceId}>Record move</button>
        </form>
        <h3>Stay history</h3>
        {props.stays.map((stay) => <article className="visit-card" key={String(stay.id)}>
          <p>Place: {String(stay.place_id)}</p><p>From: {String(stay.starts_on)} to {String(stay.ends_on ?? 'Current stay')}</p>
        </article>)}
      </>}
    </section>
  );
}
