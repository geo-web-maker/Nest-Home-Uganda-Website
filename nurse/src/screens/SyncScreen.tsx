import { useState } from 'react';
import type { LocalPhoto, OutboxOperation } from '../offline/db';
import { conflictMessage, isRemovedVisitConflict } from '../offline/syncPolicy';
import { copy, operationKindLabel } from '../copy';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { PillButton } from '../ui/PillButton';
import { Banner } from '../ui/Banner';
import { Sheet, SheetActions } from '../ui/Sheet';

type Props = {
  operations: OutboxOperation[]; photos: LocalPhoto[]; userId: string; online: boolean; busy: boolean; wifiOnly: boolean;
  onSync: () => void; onRetry: (id: string) => void; onDiscard: (id: string) => void;
  onApplyAgain: (operation: OutboxOperation) => void; onRetryPhoto: (id: string) => void; onUploadPhotoNow: (id: string) => void; onDiscardPhoto: (id: string) => void;
};
type State = 'queued' | 'deferred' | 'attention';

export function SyncScreen(props: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const ownOperations = props.operations.filter((item) => item.ownerUserId === props.userId);
  const ownPhotos = props.photos.filter((item) => item.ownerUserId === props.userId);
  const now = Date.now();
  const queued = ownOperations.filter((item) => item.state === 'queued' && (!item.retryAfter || Date.parse(item.retryAfter) <= now));
  const deferred = ownOperations.filter((item) => item.state === 'queued' && item.retryAfter && Date.parse(item.retryAfter) > now);
  const attention = ownOperations.filter((item) => item.state === 'needs_attention');
  const queuedPhotos = ownPhotos.filter((item) => item.state === 'queued' && (!item.retryAfter || Date.parse(item.retryAfter) <= now));
  const photoAttention = ownPhotos.filter((item) => item.state === 'needs_attention');
  const queuedPhotosDeferred = ownPhotos.filter((item) => item.state === 'queued' && item.retryAfter && Date.parse(item.retryAfter) > now);
  const countQueued = queued.length + queuedPhotos.length;
  const countDeferred = deferred.length + queuedPhotosDeferred.length;
  const countAttention = attention.length + photoAttention.length;

  function copyDetail(detail: string) { void navigator.clipboard?.writeText(detail).catch(() => undefined); }
  function operationRow(item: OutboxOperation, state: State) {
    const isAttention = state === 'attention';
    const conflictText = conflictMessage(item.lastError);
    const canApplyAgain = isAttention && !isRemovedVisitConflict(item.lastError) && !/adhoc_disabled|visit_not_assigned|no longer assigned|cancelled or reassigned|invalid_payload|invalid payload/i.test(item.lastError ?? '');
    const chipKind = state === 'attention' ? 'rv' : state === 'deferred' ? 'pd' : 'sc';
    const chipText = state === 'attention' ? copy.sync.attention : state === 'deferred' ? copy.sync.deferredStatus : copy.sync.waitingStatus;
    return <details className="sync-disclosure" key={item.id}>
      <summary><span className="sync-summary-copy"><strong>{operationKindLabel(item.kind)}</strong><small>{state === 'attention' ? conflictText : item.retryAfter ? `${copy.sync.nextRetry} ${new Date(item.retryAfter).toLocaleTimeString()}` : copy.sync.savedWaiting}</small></span><Chip kind={chipKind}>{chipText}</Chip></summary>
      <div className="sync-disclosure-detail"><p>{copy.sync.copyRef} {item.id}</p>{isAttention && item.lastError && <p>{item.lastError}</p>}
        <div className="inline-actions">
          {isAttention ? <><PillButton size="sm" tone="ghost" showArrow={false} onClick={() => copyDetail(item.lastError ?? conflictText)}>{copy.generic.copyError}</PillButton>{canApplyAgain && <PillButton size="sm" onClick={() => props.onApplyAgain(item)}>{copy.sync.applyAgain}</PillButton>}<PillButton size="sm" tone="danger" onClick={() => setConfirmId(item.id)}>{copy.generic.discard}</PillButton></> : <PillButton size="sm" tone="ghost" onClick={() => props.onRetry(item.id)}>{copy.generic.retry}</PillButton>}
        </div>
      </div>
    </details>;
  }
  function photoRow(photo: LocalPhoto, state: State) {
    const isAttention = state === 'attention';
    const isDeferred = state === 'deferred';
    return <details className="sync-disclosure" key={photo.id}>
      <summary><span className="sync-summary-copy"><strong>{copy.sync.photo}</strong><small>{isAttention ? photo.lastError ?? copy.sync.photoError : isDeferred ? `${copy.sync.nextPhotoRetry} ${new Date(photo.retryAfter!).toLocaleTimeString()}` : `${copy.sync.photoSavedFor} ${photo.visitId}`}</small></span><Chip kind={isAttention ? 'rv' : isDeferred ? 'pd' : 'sc'}>{isAttention ? copy.sync.attention : isDeferred ? copy.sync.deferredStatus : copy.sync.waitingStatus}</Chip></summary>
      <div className="sync-disclosure-detail"><p>{copy.sync.copyRef} {photo.id}</p>{photo.uploadStage === 'uploaded' && <p>{copy.photos.discardAfterTransfer}</p>}
        <div className="inline-actions">
          <PillButton size="sm" tone="ghost" onClick={() => props.onRetryPhoto(photo.id)}>{isAttention ? copy.sync.retryUpload : copy.generic.retry}</PillButton>
          {!isAttention && props.wifiOnly && props.online && <PillButton size="sm" tone="ghost" onClick={() => props.onUploadPhotoNow(photo.id)}>{copy.sync.useMobileData}</PillButton>}
          {isAttention && <PillButton size="sm" tone="danger" disabled={photo.uploadStage === 'uploaded' || photo.state === 'sending'} onClick={() => setConfirmId(photo.id)}>{copy.sync.discardPhoto}</PillButton>}
        </div>
      </div>
    </details>;
  }
  return <section className="screen mk-sync-screen" aria-labelledby="sync-heading">
    <header className="screen-heading"><div><p className="eyebrow">{copy.sync.eyebrow}</p><h2 id="sync-heading">{copy.sync.heading}</h2></div><PillButton size="sm" onClick={props.onSync} disabled={!props.online || props.busy}>{props.busy ? copy.today.syncing : copy.sync.now}</PillButton></header>
    {!props.online && <Banner tone="warn">{copy.sync.offline}</Banner>}
    <Card className="mk-sync-overview"><p>{copy.sync.lastSynced}: {copy.sync.lastSyncStatus}</p><div className="mk-sync-counts"><div><strong>{countQueued}</strong><span>{copy.sync.queued}</span></div><div><strong>{countDeferred}</strong><span>{copy.sync.deferred}</span></div><div><strong>{countAttention}</strong><span>{copy.sync.attention}</span></div></div></Card>
    <Card className="mk-sync-section"><h3>{copy.sync.queued} ({countQueued})</h3>{countQueued === 0 && <p>{copy.sync.noQueued}</p>}{queued.map((item) => operationRow(item, 'queued'))}{queuedPhotos.map((photo) => photoRow(photo, 'queued'))}</Card>
    <Card className="mk-sync-section"><h3>{copy.sync.deferred} ({countDeferred})</h3>{countDeferred === 0 && <p>{copy.sync.noDeferred}</p>}{deferred.map((item) => operationRow(item, 'deferred'))}{queuedPhotosDeferred.map((photo) => photoRow(photo, 'deferred'))}</Card>
    <Card className="mk-sync-section"><h3>{copy.sync.attention} ({countAttention})</h3>{countAttention === 0 && <p>{copy.sync.noAttention}</p>}{attention.map((item) => operationRow(item, 'attention'))}{photoAttention.map((photo) => photoRow(photo, 'attention'))}</Card>
    {confirmId && <Sheet role="alertdialog" labelledBy="discard-title"><h2 id="discard-title">{copy.generic.discardConfirmTitle}</h2><p>{copy.generic.discardConfirmCopy}</p><SheetActions><PillButton tone="danger" onClick={() => { const photo = ownPhotos.find((item) => item.id === confirmId); if (photo) props.onDiscardPhoto(confirmId); else props.onDiscard(confirmId); setConfirmId(null); }}>{copy.generic.confirmDiscard}</PillButton><PillButton tone="ghost" onClick={() => setConfirmId(null)}>{copy.generic.keepItem}</PillButton></SheetActions></Sheet>}
    <p className="privacy-hint">{copy.generic.contactAdmin}</p>
  </section>;
}
