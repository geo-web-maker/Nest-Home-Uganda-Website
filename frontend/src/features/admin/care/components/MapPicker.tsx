import { useMemo, useState } from 'react';
import { Field } from '../../../../components/ui/Field';
import styles from './MapPicker.module.css';

type Props = { tileUrl?: string; lat: string; lng: string; radius: string; onChange: (value: { lat: string; lng: string; radius: string }) => void; markers?: Array<{lat:number;lng:number;label?:string}> };
export function MapPicker({ tileUrl, lat, lng, radius, onChange, markers=[] }: Props) {
  const [message, setMessage] = useState('');
  const rounded = useMemo(() => ({ lat: Number(lat).toFixed(6), lng: Number(lng).toFixed(6) }), [lat, lng]);
  function validate() {
    const latitude = Number(lat), longitude = Number(lng), r = Number(radius);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return setMessage('Latitude must be between -90 and 90.');
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return setMessage('Longitude must be between -180 and 180.');
    if (!Number.isFinite(r) || r < 50 || r > 1000) return setMessage('Radius must be between 50 and 1000 metres.');
    onChange({ lat: latitude.toFixed(6), lng: longitude.toFixed(6), radius: String(Math.round(r)) });
    setMessage('Location validated and rounded to six decimal places.');
  }
  return <section className={styles.wrap} aria-label="Map location picker">
    <div className={styles.map} style={tileUrl ? { backgroundImage: `url(${tileUrl})` } : undefined}>
      <span className={styles.pin} aria-hidden="true">+</span>
      {markers.map((marker,index)=><span key={`${marker.lat}-${marker.lng}-${index}`} className={styles.marker} title={marker.label ?? `Event ${index+1}`}>•</span>)}
      <span className={styles.caption}>Configured map tile preview</span>
    </div>
    <div className={styles.fields}>
      <Field label="Latitude" type="number" step="0.000001" value={lat} onChange={e => onChange({ lat: e.target.value, lng, radius })} />
      <Field label="Longitude" type="number" step="0.000001" value={lng} onChange={e => onChange({ lat, lng: e.target.value, radius })} />
      <Field label="Radius (m)" type="number" min="50" max="1000" value={radius} onChange={e => onChange({ lat, lng, radius: e.target.value })} />
    </div>
    <button type="button" onClick={validate}>Validate location</button>
    <output role="status">{message || (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? `${rounded.lat}, ${rounded.lng}` : '')}</output>
  </section>;
}
