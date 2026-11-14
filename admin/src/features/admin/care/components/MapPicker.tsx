import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { Button } from '@shared/components/ui/Button';
import { Field } from '@shared/components/ui/Field';
import styles from './MapPicker.module.css';

/** How the saved location was chosen. Lets staff judge how much to trust it. */
export type LocationSource = 'pin' | 'gps' | 'search' | 'coordinates' | 'unknown';

type Props = {
  tileUrl?: string;
  lat: string;
  lng: string;
  radius: string;
  /** `source` is present only when the location itself changed, not when only the radius did. */
  onChange: (value: { lat: string; lng: string; radius: string; source?: LocationSource }) => void;
  markers?: Array<{ lat: number; lng: number; label?: string }>;
  /** Show the map only: no search, no tapping, no dragging. Used when reviewing recorded events. */
  readOnly?: boolean;
};

type GeocodeResult = { lat?: string; lon?: string; display_name?: string };
type Place = { lat: number; lng: number; label: string };

const NO_MARKERS: NonNullable<Props['markers']> = [];
const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors';
const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_ATTRIBUTION = 'Imagery &copy; Esri, Maxar, Earthstar Geographics';
// Kampala. Used only to centre the empty map; nothing is saved from it.
const DEFAULT_CENTER: [number, number] = [0.3476, 32.5825];

function parsePoint(lat: string, lng: string): { lat: number; lng: number } | null {
  if (!lat.trim() || !lng.trim()) return null;
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { lat: latitude, lng: longitude };
}

function parseRadius(radius: string): number {
  const metres = Number(radius);
  return Number.isFinite(metres) && metres >= 50 && metres <= 1000 ? metres : 150;
}

export function MapPicker({ tileUrl, lat, lng, radius, onChange, markers = NO_MARKERS, readOnly = false }: Props) {
  const [message, setMessage] = useState('');
  const [addressQuery, setAddressQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [locating, setLocating] = useState(false);
  const [satellite, setSatellite] = useState(false);
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'failed'>('loading');

  const container = useRef<HTMLDivElement | null>(null);
  const leaflet = useRef<typeof Leaflet | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const base = useRef<Leaflet.TileLayer | null>(null);
  const pin = useRef<Leaflet.Marker | null>(null);
  const ring = useRef<Leaflet.Circle | null>(null);
  const dots = useRef<Leaflet.LayerGroup | null>(null);
  const framed = useRef(false);

  // Event handlers registered once on the Leaflet map must see the latest props.
  const latest = useRef({ onChange, radius, readOnly });
  latest.current = { onChange, radius, readOnly };

  const point = useMemo(() => parsePoint(lat, lng), [lat, lng]);
  const metres = parseRadius(radius);
  const radiusInvalid = radius.trim() !== '' && !(Number(radius) >= 50 && Number(radius) <= 1000);

  const place = useCallback((latitude: number, longitude: number, source: LocationSource = 'pin') => {
    if (latest.current.readOnly) return;
    latest.current.onChange({ lat: latitude.toFixed(6), lng: longitude.toFixed(6), radius: latest.current.radius, source });
  }, []);

  // Create the map once. Leaflet is imported on demand so it never loads on screens without a map.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('leaflet');
        await import('leaflet/dist/leaflet.css');
        if (cancelled || !container.current) return;
        const L = ((mod as unknown as { default?: typeof Leaflet }).default ?? mod) as typeof Leaflet;
        leaflet.current = L;
        const instance = L.map(container.current, { center: DEFAULT_CENTER, zoom: 12, zoomControl: true, attributionControl: true });
        map.current = instance;
        dots.current = L.layerGroup().addTo(instance);
        instance.on('click', (event: Leaflet.LeafletMouseEvent) => place(event.latlng.lat, event.latlng.lng));
        setMapState('ready');
      } catch {
        if (!cancelled) setMapState('failed');
      }
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      pin.current = null;
      ring.current = null;
      base.current = null;
      framed.current = false;
    };
  }, [place]);

  // Base layer: the organisation's tile setting, or OpenStreetMap, or satellite.
  useEffect(() => {
    const L = leaflet.current;
    const instance = map.current;
    if (mapState !== 'ready' || !L || !instance) return;
    base.current?.remove();
    const url = satellite ? SATELLITE_TILES : tileUrl?.trim() || OSM_TILES;
    base.current = L.tileLayer(url, {
      maxZoom: 19,
      attribution: satellite ? SATELLITE_ATTRIBUTION : OSM_ATTRIBUTION,
    }).addTo(instance);
    base.current.on('tileerror', () => setMessage('Map tiles could not load. You can still enter the coordinates below.'));
  }, [mapState, satellite, tileUrl]);

  // Pin and radius ring follow the values the parent holds.
  useEffect(() => {
    const L = leaflet.current;
    const instance = map.current;
    if (mapState !== 'ready' || !L || !instance) return;
    if (!point) {
      pin.current?.remove();
      ring.current?.remove();
      pin.current = null;
      ring.current = null;
      return;
    }
    const position: Leaflet.LatLngExpression = [point.lat, point.lng];
    if (!pin.current) {
      const icon = L.divIcon({ className: styles.pinIcon, html: '<span></span>', iconSize: [32, 32], iconAnchor: [16, 32] });
      pin.current = L.marker(position, { draggable: !readOnly, icon, keyboard: true, title: 'Drag to the exact spot' }).addTo(instance);
      pin.current.on('dragend', () => {
        const next = pin.current?.getLatLng();
        if (next) place(next.lat, next.lng);
      });
    } else {
      pin.current.setLatLng(position);
    }
    if (!ring.current) {
      ring.current = L.circle(position, { radius: metres, color: '#1f6b4a', weight: 2, fillOpacity: 0.12, interactive: false }).addTo(instance);
    } else {
      ring.current.setLatLng(position);
      ring.current.setRadius(metres);
    }
    // Zoom in the first time a point appears; afterwards only pan so the admin's zoom is respected.
    if (!framed.current) {
      framed.current = true;
      instance.setView(position, 17);
    } else if (!instance.getBounds().contains(position)) {
      instance.panTo(position);
    }
  }, [mapState, point, metres, place, readOnly]);

  // Event dots (visit review). Frame them when there is no pin.
  useEffect(() => {
    const L = leaflet.current;
    const instance = map.current;
    const group = dots.current;
    if (mapState !== 'ready' || !L || !instance || !group) return;
    group.clearLayers();
    markers.forEach((marker, index) => {
      if (!Number.isFinite(marker.lat) || !Number.isFinite(marker.lng)) return;
      L.circleMarker([marker.lat, marker.lng], { radius: 6, color: '#a66a00', weight: 2, fillOpacity: 0.9 })
        .bindTooltip(marker.label ?? `Event ${index + 1}`)
        .addTo(group);
    });
  }, [mapState, markers]);

  function flyTo(latitude: number, longitude: number) {
    framed.current = true;
    map.current?.setView([latitude, longitude], 17);
  }

  function choose(result: Place) {
    place(result.lat, result.lng, 'search');
    flyTo(result.lat, result.lng);
    setResults([]);
    setAddressQuery(result.label);
    setMessage('Place found. Drag the pin onto the exact house, then check the circle.');
  }

  async function searchAddress() {
    const query = addressQuery.trim();
    if (query.length < 3) {
      setSearchError('Enter at least three characters to search for a place.');
      return;
    }
    setSearching(true);
    setSearchError('');
    setResults([]);
    try {
      const parameters = new URLSearchParams({ q: query, format: 'jsonv2', limit: '5', countrycodes: 'ug' });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${parameters.toString()}`, {
        headers: { Accept: 'application/json' },
        method: 'GET',
      });
      if (!response.ok) throw new Error('Place search is temporarily unavailable. Tap the map instead.');
      const found = ((await response.json()) as GeocodeResult[])
        .map((item) => ({ lat: Number(item.lat), lng: Number(item.lon), label: item.display_name ?? query }))
        .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
      if (found.length === 0) {
        setSearchError('Nothing found. Try the nearest trading centre or parish, or tap the map.');
      } else if (found.length === 1 && found[0]) {
        choose(found[0]);
      } else {
        setResults(found);
      }
    } catch (reason) {
      setSearchError(reason instanceof Error ? reason.message : 'Place search failed. Tap the map instead.');
    } finally {
      setSearching(false);
    }
  }

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setMessage('This device cannot share its location. Tap the map instead.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        place(position.coords.latitude, position.coords.longitude, 'gps');
        flyTo(position.coords.latitude, position.coords.longitude);
        setMessage(`Set from this device (accurate to about ${Math.round(position.coords.accuracy)} m). Use this only when you are at the client's home.`);
      },
      () => {
        setLocating(false);
        setMessage('Location permission was not given. Tap the map instead.');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  const status = message || (point && !readOnly ? 'Check that the pin sits on the right house before saving.' : '');

  return (
    <section className={styles.wrap} aria-label="Map location picker">
      {/* No onSubmit: the picker lives inside other forms, and forms cannot nest. */}
      {!readOnly && (<>
      <div className={styles.search}>
        <Field
          label="Search a place or landmark"
          type="search"
          value={addressQuery}
          onChange={(event) => setAddressQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void searchAddress(); } }}
          placeholder="For example, a trading centre, church or school"
        />
        <Button type="button" variant="outline" onClick={() => void searchAddress()} disabled={searching}>
          {searching ? 'Searching…' : 'Search'}
        </Button>
      </div>
      {searchError && <p className={styles.error} role="alert">{searchError}</p>}
      {results.length > 0 && (
        <ul className={styles.results} aria-label="Search results">
          {results.map((result) => (
            <li key={`${result.lat},${result.lng}`}>
              <button type="button" onClick={() => choose(result)}>{result.label}</button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.toolbar}>
        <Button type="button" variant="outline" onClick={useMyLocation} disabled={locating}>
          {locating ? 'Finding location…' : 'Use my current location'}
        </Button>
        <Button type="button" variant="outline" onClick={() => setSatellite((value) => !value)} aria-pressed={satellite}>
          {satellite ? 'Show street map' : 'Show satellite'}
        </Button>
      </div>

      </>)}

      <div className={styles.map}>
        <div ref={container} className={styles.canvas} role="application" aria-label="Map. Tap to place the pin, drag the pin to adjust." />
        {mapState === 'loading' && <p className={styles.overlay}>Loading map…</p>}
        {mapState === 'failed' && <p className={styles.overlay}>The map could not load. Enter the coordinates below instead.</p>}
        {mapState === 'ready' && !point && markers.length === 0 && !readOnly && (
          <p className={styles.hint}>Search above, use your location, or tap the map to drop a pin.</p>
        )}
      </div>

      {!readOnly && (<>
      <label className={styles.radius}>
        <span>Arrival radius: <strong>{metres} m</strong></span>
        <input
          type="range"
          min={50}
          max={1000}
          step={10}
          value={metres}
          onChange={(event) => onChange({ lat, lng, radius: event.target.value })}
          aria-label="Arrival radius in metres"
        />
        <small>A nurse is counted as arrived inside this circle. Use a smaller circle for a compound, a larger one for a rural homestead.</small>
      </label>

      <details className={styles.advanced}>
        <summary>Enter coordinates instead</summary>
        <div className={styles.fields}>
          <Field label="Latitude" type="number" step="0.000001" value={lat} onChange={(event) => onChange({ lat: event.target.value, lng, radius, source: 'coordinates' })} />
          <Field label="Longitude" type="number" step="0.000001" value={lng} onChange={(event) => onChange({ lat, lng: event.target.value, radius, source: 'coordinates' })} />
          <Field label="Radius (m)" type="number" min="50" max="1000" value={radius} onChange={(event) => onChange({ lat, lng, radius: event.target.value })} />
        </div>
        {(lat.trim() || lng.trim()) && !point && <p className={styles.error} role="alert">Latitude must be between -90 and 90, and longitude between -180 and 180.</p>}
        {radiusInvalid && <p className={styles.error} role="alert">Radius must be between 50 and 1000 metres.</p>}
      </details>
      </>)}

      <output role="status" className={styles.status}>{status}</output>
    </section>
  );
}
