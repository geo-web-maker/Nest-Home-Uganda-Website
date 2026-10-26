import { useEffect, useState, type FormEvent } from 'react';
import type { CachedVisit, LocalPhoto } from '../offline/db';
import { copy } from '../copy';

function PhotoThumbnail({ photo }: { photo: LocalPhoto }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!photo.thumbnail) { setUrl(''); return; }
    const nextUrl = URL.createObjectURL(photo.thumbnail);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [photo.thumbnail]);
  return <figure className="pending-photo">{url ? <img src={url} alt={copy.photos.thumbnailAlt} /> : <div className="thumbnail-placeholder" aria-hidden="true">{copy.photos.thumbnailPlaceholder}</div>}<figcaption>{photo.state === 'needs_attention' ? copy.photos.needsAttention : photo.uploadStage === 'uploaded' ? copy.photos.uploadedPending : copy.photos.waitingUpload}</figcaption></figure>;
}

type Props = { visit: CachedVisit; file: File | null; onFile: (file: File | null) => void; onSubmit: (event: FormEvent) => void; onCancel: () => void; pendingPhotos: LocalPhoto[]; pendingCount: number; wifiOnly: boolean; onWifiOnly: (value: boolean) => void; busy?: boolean };
export function PhotoSheet({ visit, file, onFile, onSubmit, onCancel, pendingPhotos, pendingCount, wifiOnly, onWifiOnly, busy = false }: Props) {
  return <div className="sheet-backdrop"><section className="sheet photo-sheet" role="dialog" aria-modal="true" aria-labelledby="photo-title"><h2 id="photo-title">{copy.visit.photo} · {visit.client_display_name}</h2><p>{copy.photos.description}</p>
    {pendingCount > 20 && <p role="status" className="notice">{copy.photos.overLimit}</p>}
    {pendingPhotos.length > 0 && <div className="thumbnail-list" aria-label={copy.photos.queuedLabel}>{pendingPhotos.map((photo) => <PhotoThumbnail key={photo.id} photo={photo} />)}</div>}
    <form onSubmit={onSubmit} className="stack-form"><label htmlFor="photo-file">{copy.photos.choose}</label><input id="photo-file" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required onChange={(event) => onFile(event.target.files?.[0] ?? null)} /><label className="check-row"><input type="checkbox" checked={wifiOnly} onChange={(event) => onWifiOnly(event.target.checked)} /> {copy.photos.wifiOnly}</label><p className="hint">{copy.photos.wifiHint}</p><div className="sheet-actions"><button type="submit" disabled={!file || busy}>{busy ? copy.photos.saving : copy.photos.save}</button><button type="button" className="button-secondary" onClick={onCancel} disabled={busy}>{copy.generic.cancel}</button></div></form>
  </section></div>;
}
