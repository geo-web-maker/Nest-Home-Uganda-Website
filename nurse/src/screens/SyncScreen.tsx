import { useState } from 'react';
import type { LocalPhoto, OutboxOperation } from '../offline/db';
import { conflictMessage, isRemovedVisitConflict } from '../offline/syncPolicy';
import { copy, operationKindLabel } from '../copy';

type Props = {
  operations: OutboxOperation[]; photos: LocalPhoto[]; userId: string; online: boolean; busy: boolean; wifiOnly: boolean;
  onSync: () => void; onRetry: (id: string) => void; onDiscard: (id: string) => void;
  onApplyAgain: (operation: OutboxOperation) => void; onRetryPhoto: (id: string) => void; onUploadPhotoNow: (id: string) => void; onDiscardPhoto: (id: string) => void;
};
export function SyncScreen(props: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const ownOperations = props.operations.filter((item) => item.ownerUserId === props.userId);
  const ownPhotos = props.photos.filter((item) => item.ownerUserId === props.userId);
  const queued = ownOperations.filter((item) => item.state === 'queued' && (!item.retryAfter || Date.parse(item.retryAfter) <= Date.now()));
  const deferred = ownOperations.filter((item) => item.state === 'queued' && item.retryAfter && Date.parse(item.retryAfter) > Date.now());
  const attention = ownOperations.filter((item) => item.state === 'needs_attention');
  const queuedPhotos = ownPhotos.filter((item) => item.state === 'queued' && (!item.retryAfter || Date.parse(item.retryAfter) <= Date.now()));
  const photoAttention = ownPhotos.filter((item) => item.state === 'needs_attention');
  const queuedPhotosDeferred = ownPhotos.filter((item) => item.state === 'queued' && item.retryAfter && Date.parse(item.retryAfter) > Date.now());

  function copyDetail(detail: string) {
    void navigator.clipboard?.writeText(detail).catch(() => undefined);
  }
  function renderOperation(item: OutboxOperation, attentionItem = false) {
    const conflictText = conflictMessage(item.lastError);
    const canApplyAgain = attentionItem && !isRemovedVisitConflict(item.lastError) && !/adhoc_disabled|visit_not_assigned|no longer assigned|cancelled or reassigned|invalid_payload|invalid payload/i.test(item.lastError ?? '');
    return <article className="sync-row" key={item.id}>
      <div><h3>{operationKindLabel(item.kind)}</h3><p>{attentionItem ? conflictText : item.retryAfter ? `${copy.sync.nextRetry} ${new Date(item.retryAfter).toLocaleTimeString()}` : copy.sync.savedWaiting}</p><p className="muted">{copy.sync.copyRef} {item.id}</p></div>
      <div className="inline-actions">
        {attentionItem ? <><button type="button" onClick={() => copyDetail(item.lastError ?? conflictText)}>{copy.generic.copyError}</button>{canApplyAgain && <button type="button" onClick={() => props.onApplyAgain(item)}>{copy.sync.applyAgain}</button>}<button type="button" className="button-danger" onClick={() => setConfirmId(item.id)}>{copy.generic.discard}</button></> : <button type="button" className="button-secondary" onClick={() => props.onRetry(item.id)}>{copy.generic.retry}</button>}
      </div>
    </article>;
  }
  return <section className="screen" aria-labelledby="sync-heading"><div className="screen-heading"><div><p className="eyebrow">{copy.sync.eyebrow}</p><h2 id="sync-heading">{copy.sync.heading}</h2></div><button type="button" onClick={props.onSync} disabled={!props.online || props.busy}>{props.busy ? copy.today.syncing : copy.sync.now}</button></div>
    {!props.online && <p role="status">{copy.sync.offline}</p>}
    <section className="panel"><h3>{copy.sync.queued} ({queued.length + queuedPhotos.length})</h3>{queued.length === 0 && queuedPhotos.length === 0 && <p>{copy.sync.noQueued}</p>}{queued.map((item) => renderOperation(item))}{queuedPhotos.map((photo) => <article className="sync-row" key={photo.id}><div><h3>{copy.sync.photo}</h3><p>{copy.sync.photoSavedFor} {photo.visitId}</p><p className="muted">{copy.sync.copyRef} {photo.id}</p></div><div className="inline-actions"><button type="button" onClick={() => props.onRetryPhoto(photo.id)}>{copy.generic.retry}</button>{props.wifiOnly && props.online && <button type="button" className="button-secondary" onClick={() => props.onUploadPhotoNow(photo.id)}>{copy.sync.useMobileData}</button>}</div></article>)}</section>
    <section className="panel"><h3>{copy.sync.deferred} ({deferred.length + queuedPhotosDeferred.length})</h3>{deferred.length === 0 && queuedPhotosDeferred.length === 0 && <p>{copy.sync.noDeferred}</p>}{deferred.map((item) => renderOperation(item))}{queuedPhotosDeferred.map((photo) => <article className="sync-row" key={photo.id}><div><h3>{copy.sync.photo}</h3><p>{copy.sync.nextPhotoRetry} {new Date(photo.retryAfter!).toLocaleTimeString()}</p><p className="muted">{copy.sync.copyRef} {photo.id}</p></div><div className="inline-actions"><button type="button" onClick={() => props.onRetryPhoto(photo.id)}>{copy.generic.retry}</button>{props.wifiOnly && props.online && <button type="button" className="button-secondary" onClick={() => props.onUploadPhotoNow(photo.id)}>{copy.sync.useMobileData}</button>}</div></article>)}</section>
    <section className="panel"><h3>{copy.sync.attention} ({attention.length + photoAttention.length})</h3>{attention.length === 0 && photoAttention.length === 0 && <p>{copy.sync.noAttention}</p>}{attention.map((item) => renderOperation(item, true))}{photoAttention.map((photo) => <article className="sync-row" key={photo.id}><div><h3>{copy.sync.photo}</h3><p>{photo.lastError ?? copy.sync.photoError}</p>{photo.uploadStage === 'uploaded' && <p>{copy.photos.discardAfterTransfer}</p>}<p className="muted">{copy.sync.copyRef} {photo.id}</p></div><div className="inline-actions"><button type="button" onClick={() => props.onRetryPhoto(photo.id)}>{copy.sync.retryUpload}</button><button type="button" className="button-danger" disabled={photo.uploadStage === 'uploaded' || photo.state === 'sending'} onClick={() => setConfirmId(photo.id)}>{copy.sync.discardPhoto}</button></div></article>)}</section>
    {confirmId && <div className="sheet-backdrop"><section className="sheet" role="alertdialog" aria-modal="true" aria-labelledby="discard-title"><h2 id="discard-title">{copy.generic.discardConfirmTitle}</h2><p>{copy.generic.discardConfirmCopy}</p><div className="sheet-actions"><button type="button" className="button-danger" onClick={() => { const photo = ownPhotos.find((item) => item.id === confirmId); if (photo) props.onDiscardPhoto(confirmId); else props.onDiscard(confirmId); setConfirmId(null); }}>{copy.generic.confirmDiscard}</button><button type="button" className="button-secondary" onClick={() => setConfirmId(null)}>{copy.generic.keepItem}</button></div></section></div>}
    <p className="privacy-hint">{copy.generic.contactAdmin}</p>
  </section>;
}
