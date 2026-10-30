import { useEffect, useState, type FormEvent } from 'react';
import type { CachedVisit, LocalPhoto } from '../offline/db';
import { copy } from '../copy';
import { Banner } from '../ui/Banner';
import { Card } from '../ui/Card';
import { PillButton } from '../ui/PillButton';
import { Sheet, SheetActions } from '../ui/Sheet';
import { kampalaDateKey } from '../lib/time';
import { apiAssetUrl } from '../lib/api/client';

export type PhotoType = 'arrival' | 'departure' | 'other';
export type ServerVisitPhoto = {
  id: string;
  visit_id: string;
  photo_type: PhotoType;
  status: string;
  created_at: string;
  thumbnail_path?: { path: string; expires_at: number } | null;
  original_path?: { path: string; expires_at: number } | null;
};
type ViewerSource = Blob | string;

function guidanceStorageKey() {
  return `nest.nurse.photo-guidance-seen:${kampalaDateKey(new Date())}`;
}

function PhotoThumbnail({ photo, onView, canEdit, onRetake, onDelete }: { photo: LocalPhoto; onView: () => void; canEdit: boolean; onRetake: () => void; onDelete: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!photo.thumbnail) { setUrl(''); return; }
    const nextUrl = URL.createObjectURL(photo.thumbnail);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [photo.thumbnail]);
  const label = photo.uploadStage === 'uploaded' ? copy.photos.uploadedPending : photo.state === 'needs_attention' ? copy.photos.needsAttention : photo.state === 'sending' ? copy.photos.sending : copy.photos.waitingUpload;
  return <figure className="photo-entry">
    <button type="button" className="photo-preview-trigger" onClick={onView} aria-label={`${copy.photos.viewPhoto}: ${photo.id}`}>
      {url ? <img src={url} alt={copy.photos.thumbnailAlt} /> : <span className="thumbnail-placeholder">{copy.photos.thumbnailPlaceholder}</span>}
    </button>
    <figcaption><strong>{photo.photoType ?? 'other'}</strong><span>{label}</span></figcaption>
    {canEdit && <div className="photo-local-actions"><PillButton type="button" size="sm" tone="ghost" showArrow={false} onClick={onRetake}>{copy.photos.retakeLocal}</PillButton><PillButton type="button" size="sm" tone="danger" showArrow={false} onClick={onDelete}>{copy.photos.deleteLocal}</PillButton></div>}
  </figure>;
}

function PhotoViewer({ source, title, onClose }: { source: ViewerSource; title: string; onClose: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (typeof source === 'string') { setUrl(source); return; }
    const nextUrl = URL.createObjectURL(source);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [source]);
  return <Sheet placement="center" labelledBy="photo-viewer-title" className="photo-viewer">
    <div className="screen-heading"><h2 id="photo-viewer-title">{title}</h2><PillButton type="button" size="sm" tone="ghost" showArrow={false} onClick={onClose}>{copy.photos.closeViewer}</PillButton></div>
    {url ? <img src={url} alt={copy.photos.reviewPhoto} /> : <p role="status">{copy.photos.serverPhotosLoading}</p>}
  </Sheet>;
}

type Props = {
  visit: CachedVisit;
  file: File | null;
  onFile: (file: File | null) => void;
  onSubmit: (event: FormEvent, photoType: PhotoType) => void;
  onCancel: () => void;
  onDiscardLocalPhoto?: (id: string) => void;
  onRetakeLocalPhoto?: (id: string) => void;
  pendingPhotos: LocalPhoto[];
  pendingCount: number;
  serverPhotos?: ServerVisitPhoto[];
  serverPhotosLoading?: boolean;
  photosEnabled?: boolean;
  guidanceText?: string;
  wifiOnly: boolean;
  onWifiOnly: (value: boolean) => void;
  busy?: boolean;
};

export function PhotoSheet({
  visit, file, onFile, onSubmit, onCancel, onDiscardLocalPhoto, onRetakeLocalPhoto, pendingPhotos, pendingCount,
  serverPhotos = [], serverPhotosLoading = false, photosEnabled = true,
  guidanceText = '', wifiOnly, onWifiOnly, busy = false,
}: Props) {
  const [photoType, setPhotoType] = useState<PhotoType>('other');
  const [guidanceSeen, setGuidanceSeen] = useState(() => localStorage.getItem(guidanceStorageKey()) === 'true');
  const [viewer, setViewer] = useState<{ source: ViewerSource; title: string } | null>(null);
  const [localPhotoAction, setLocalPhotoAction] = useState<{ id: string; action: 'retake' | 'delete' } | null>(null);
  const [filePreview, setFilePreview] = useState('');
  const visitPhotoAllowed = Boolean(photosEnabled && visit.photo_rules?.allowed);

  useEffect(() => {
    if (!file) { setFilePreview(''); return; }
    const nextUrl = URL.createObjectURL(file);
    setFilePreview(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  function acknowledgeGuidance() {
    localStorage.setItem(guidanceStorageKey(), 'true');
    setGuidanceSeen(true);
  }

  return <>
    <Sheet labelledBy="photo-title" className="photo-sheet">
      <p className="eyebrow">{copy.photos.photosOnVisit}</p>
      <h2 id="photo-title">{copy.visit.photo} · {visit.client_display_name}</h2>

      {!visitPhotoAllowed ? <Banner tone="info" className="photo-off-state"><strong>{copy.photos.photosOffTitle}</strong> {copy.photos.photosOffBody}</Banner> : <>
        {!guidanceSeen && <Card className="photo-guidance" aria-labelledby="photo-guidance-title">
          <p className="eyebrow">{copy.photos.guidanceTitle}</p>
          <h3 id="photo-guidance-title">{copy.photos.guidanceTitle}</h3>
          <p>{guidanceText.trim() || copy.photos.guidanceDefault}</p>
          <p className="muted">{copy.photos.description}</p>
          <PillButton type="button" tone="forest" size="full" onClick={acknowledgeGuidance}>{copy.photos.guidanceContinue}</PillButton>
        </Card>}

        <p>{copy.photos.description}</p>
        {pendingCount > 20 && <Banner tone="warn">{copy.photos.overLimit}</Banner>}

        <section className="photo-collection" aria-labelledby="photo-collection-heading">
          <div className="screen-heading"><h3 id="photo-collection-heading">{copy.photos.photosOnVisit}</h3>{serverPhotosLoading && <span role="status">{copy.photos.serverPhotosLoading}</span>}</div>
          {pendingPhotos.length === 0 && serverPhotos.length === 0 && !serverPhotosLoading && <p className="muted">{copy.photos.noSavedPhotos}</p>}
          <div className="thumbnail-list" aria-label={copy.photos.queuedLabel}>
            {serverPhotos.map((photo) => {
              const source = photo.original_path?.path ? apiAssetUrl(photo.original_path.path) : undefined;
              const status = photo.status === 'uploaded' ? copy.photos.registeredPhoto : photo.status === 'pending' ? copy.photos.waitingUpload : photo.status;
              return <figure className="photo-entry" key={photo.id}>
                {source ? <button type="button" className="photo-preview-trigger" onClick={() => setViewer({ source, title: `${copy.photos.registeredPhoto} · ${photo.photo_type}` })} aria-label={`${copy.photos.viewPhoto}: ${photo.photo_type}`}>
                  {photo.thumbnail_path?.path ? <img src={apiAssetUrl(photo.thumbnail_path.path)} alt={copy.photos.thumbnailAlt} /> : <span className="thumbnail-placeholder">{copy.photos.thumbnailPlaceholder}</span>}
                </button> : <div className="photo-preview-placeholder"><span>{copy.photos.thumbnailPlaceholder}</span></div>}
                <figcaption><strong>{photo.photo_type}</strong><span>{status}</span></figcaption>
              </figure>;
            })}
            {pendingPhotos.map((photo) => {
              const canEdit = !busy && photo.state !== 'sending' && photo.uploadStage !== 'uploaded' && Boolean(onDiscardLocalPhoto && onRetakeLocalPhoto);
              return <PhotoThumbnail key={photo.id} photo={photo} canEdit={canEdit} onView={() => setViewer({ source: photo.blob, title: `${copy.photos.localPhoto} · ${photo.photoType ?? 'other'}` })} onRetake={() => setLocalPhotoAction({ id: photo.id, action: 'retake' })} onDelete={() => setLocalPhotoAction({ id: photo.id, action: 'delete' })} />;
            })}
          </div>
        </section>

        <form onSubmit={(event) => onSubmit(event, photoType)} className="stack-form photo-capture-form">
          <label htmlFor="photo-file">{copy.photos.choose}</label>
          <input id="photo-file" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => onFile(event.target.files?.[0] ?? null)} />
          {filePreview && <section className="photo-review" aria-labelledby="photo-review-heading">
            <h3 id="photo-review-heading">{copy.photos.reviewPhoto}</h3><img src={filePreview} alt={copy.photos.reviewPhoto} />
            <label htmlFor="photo-type">{copy.photos.photoType}</label>
            <select id="photo-type" value={photoType} onChange={(event) => setPhotoType(event.target.value as PhotoType)}>
              <option value="arrival">{copy.photos.arrivalType}</option><option value="departure">{copy.photos.departureType}</option><option value="other">{copy.photos.otherType}</option>
            </select>
          </section>}
          <label className="check-row"><input type="checkbox" checked={wifiOnly} onChange={(event) => onWifiOnly(event.target.checked)} /> {copy.photos.wifiOnly}</label>
          <p className="hint">{copy.photos.wifiHint}</p>
          <SheetActions><PillButton type="submit" tone="forest" size="full" disabled={!file || busy}>{busy ? copy.photos.saving : copy.photos.save}</PillButton><PillButton type="button" tone="ghost" size="full" showArrow={false} onClick={onCancel} disabled={busy}>{copy.generic.cancel}</PillButton></SheetActions>
        </form>
      </>}
    </Sheet>
    {viewer && <PhotoViewer source={viewer.source} title={viewer.title} onClose={() => setViewer(null)} />}
    {localPhotoAction && <Sheet placement="center" role="alertdialog" labelledBy="local-photo-action-title" className="photo-local-confirm"><h2 id="local-photo-action-title">{copy.photos.localActionTitle}</h2><p>{localPhotoAction.action === 'retake' ? copy.photos.retakeLocalCopy : copy.photos.deleteLocalCopy}</p><SheetActions><PillButton type="button" tone="danger" size="full" onClick={() => { const action = localPhotoAction; setLocalPhotoAction(null); if (action.action === 'retake') onRetakeLocalPhoto?.(action.id); else onDiscardLocalPhoto?.(action.id); }}>{localPhotoAction.action === 'retake' ? copy.photos.confirmRetakeLocal : copy.photos.confirmDeleteLocal}</PillButton><PillButton type="button" tone="ghost" size="full" showArrow={false} onClick={() => setLocalPhotoAction(null)}>{copy.photos.keepLocalPhoto}</PillButton></SheetActions></Sheet>}
  </>;
}
