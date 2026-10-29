import { useMemo, useState } from 'react';
import { ButtonGroup } from '../../../../components/admin/ButtonGroup';
import { FilterBar, filterBarGrow } from '../../../../components/admin/FilterBar';
import { Button } from '../../../../components/ui/Button';
import { Field } from '../../../../components/ui/Field';
import styles from './MapPicker.module.css';

type Props = {
  tileUrl?: string;
  lat: string;
  lng: string;
  radius: string;
  onChange: (value: { lat: string; lng: string; radius: string }) => void;
  markers?: Array<{ lat: number; lng: number; label?: string }>;
};

type GeocodeResult = { lat?: string; lon?: string; display_name?: string };

export function MapPicker({ tileUrl, lat, lng, radius, onChange, markers = [] }: Props) {
  const [message, setMessage] = useState('');
  const [addressQuery, setAddressQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const rounded = useMemo(
    () => ({
      lat: lat.trim() ? Number(lat).toFixed(6) : '',
      lng: lng.trim() ? Number(lng).toFixed(6) : '',
    }),
    [lat, lng],
  );
  const mapPreview = useMemo(() => {
    const latitude = Number(lat);
    const longitude = Number(lng);
    const metres = Number(radius);
    if (
      !lat.trim() ||
      !lng.trim() ||
      !radius.trim() ||
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      !Number.isFinite(metres) || metres < 50 || metres > 1000
    ) return null;
    // Frame the free OpenStreetMap embed around the selected point and current radius.
    const latSpan = (metres * 3) / 111_320;
    const lngSpan = latSpan / Math.max(0.15, Math.cos((latitude * Math.PI) / 180));
    const bbox = [longitude - lngSpan, latitude - latSpan, longitude + lngSpan, latitude + latSpan]
      .map((value) => value.toFixed(6)).join(',');
    const query = new URLSearchParams({ bbox, layer: 'mapnik', marker: `${latitude},${longitude}` });
    return `https://www.openstreetmap.org/export/embed.html?${query.toString()}`;
  }, [lat, lng, radius]);

  async function searchAddress() {
    const query = addressQuery.trim();
    if (query.length < 3) {
      setSearchError('Enter at least three characters to search for an address.');
      return;
    }
    setSearching(true);
    setSearchError('');
    try {
      const parameters = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1' });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${parameters.toString()}`, {
        headers: { Accept: 'application/json' },
        method: 'GET',
      });
      if (!response.ok) throw new Error('Address search is temporarily unavailable.');
      const results = (await response.json()) as GeocodeResult[];
      const result = results[0];
      const latitude = Number(result?.lat);
      const longitude = Number(result?.lon);
      if (!result || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setSearchError('No matching address was found. Try a nearby landmark or enter coordinates.');
        return;
      }
      onChange({ lat: latitude.toFixed(6), lng: longitude.toFixed(6), radius });
      setAddressQuery(result.display_name ?? query);
      setMessage('Address located. Check the pin and radius before saving.');
    } catch (reason) {
      setSearchError(reason instanceof Error ? reason.message : 'Address search failed.');
    } finally {
      setSearching(false);
    }
  }

  function validate() {
    const latitude = Number(lat);
    const longitude = Number(lng);
    const r = Number(radius);
    if (!lat.trim() || !lng.trim() || !radius.trim())
      return setMessage('Enter latitude, longitude, and radius before validating.');
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)
      return setMessage('Latitude must be between -90 and 90.');
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
      return setMessage('Longitude must be between -180 and 180.');
    if (!Number.isFinite(r) || r < 50 || r > 1000)
      return setMessage('Radius must be between 50 and 1000 metres.');
    onChange({ lat: latitude.toFixed(6), lng: longitude.toFixed(6), radius: String(Math.round(r)) });
    setMessage('Location validated and rounded to six decimal places.');
  }

  return (
    <section className={styles.wrap} aria-label="Map location picker">
      {/* No onSubmit: the picker lives inside other forms, and forms cannot nest. */}
      <FilterBar
        label="Find an address"
        actions={
          <Button type="button" variant="outline" onClick={() => void searchAddress()} disabled={searching}>
            {searching ? 'Searching…' : 'Find address'}
          </Button>
        }
      >
        <Field
          label="Search address or nearby landmark"
          type="search"
          value={addressQuery}
          onChange={(event) => setAddressQuery(event.target.value)}
          placeholder="For example, a street or trading centre"
          className={filterBarGrow}
        />
      </FilterBar>
      {searchError && <p className={styles.error} role="alert">{searchError}</p>}
      <div className={styles.map}>
        {mapPreview ? (
          <iframe
            className={styles.mapFrame}
            src={mapPreview}
            title="OpenStreetMap location preview"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className={styles.mapPlaceholder} style={tileUrl ? { backgroundImage: `url(${tileUrl})` } : undefined}>
            Search for an address or enter latitude and longitude to preview the pin.
          </div>
        )}
        {mapPreview && <span className={styles.radiusRing} aria-hidden="true" />}
        {mapPreview && <span className={styles.pin} aria-hidden="true">+</span>}
        {markers.map((marker, index) => (
          <span key={`${marker.lat}-${marker.lng}-${index}`} className={styles.marker} title={marker.label ?? `Event ${index + 1}`}>
            •
          </span>
        ))}
      </div>
      <p className={styles.mapCaption}>OpenStreetMap receives the selected coordinates to render this preview. The circle is only a radius guide; verify the point and metres before saving and follow the organisation's client-privacy policy.</p>
      <div className={styles.fields}>
        <Field label="Latitude" type="number" step="0.000001" value={lat} onChange={(event) => onChange({ lat: event.target.value, lng, radius })} />
        <Field label="Longitude" type="number" step="0.000001" value={lng} onChange={(event) => onChange({ lat, lng: event.target.value, radius })} />
        <Field label="Radius (m)" type="number" min="50" max="1000" value={radius} onChange={(event) => onChange({ lat, lng, radius: event.target.value })} />
      </div>
      <ButtonGroup><Button type="button" variant="outline" onClick={validate}>Validate location</Button></ButtonGroup>
      <output role="status">{message || (lat.trim() && lng.trim() && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? `${rounded.lat}, ${rounded.lng}` : '')}</output>
    </section>
  );
}
