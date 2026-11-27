import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { apiRequest } from '../../lib/api/client';
import { kampalaDateKey } from '../../lib/time';
import {
  applySyncPullPage,
  cacheClients,
  cacheHistory,
  listCachedClients,
  listCachedHistory,
  listCachedVisits,
  listQueuedPhotos,
  getSyncCursor,
  nurseDb,
  recoverInterruptedOperations,
  recoverInterruptedPhotos,
  removeLocalPhoto,
  updateCachedVisit,
  updateLocalPhoto,
  type CachedClient,
  type CachedHistoryVisit,
  type CachedVisit,
  type LocalPhoto,
  type OutboxOperation,
} from '../../offline/db';
import { runSync } from '../../offline/syncEngine';
import { pullSyncPages } from '../../offline/pullSyncPages';
import { canUploadPhoto } from '../photos/uploadPolicy';
import { checkoutPhotoRequirementMissing } from '../photos/requirements';
import { isRetryableSyncFailure, retryAfterIso, syncFailureMessage } from '../../offline/syncPolicy';
import { copy } from '../../copy';
import type { FieldProfile } from '../../app/useFieldProfile';

export type NurseOfflineSyncOptions = {
  token: string;
  wifiOnlyUpload: boolean;
  applyProfile: (profile: FieldProfile) => Promise<void>;
  loadProfile: () => Promise<FieldProfile>;
  refreshCareForms: () => Promise<void>;
  setOnline: Dispatch<SetStateAction<boolean>>;
  setVisits: Dispatch<SetStateAction<CachedVisit[]>>;
  setHistory: Dispatch<SetStateAction<CachedHistoryVisit[]>>;
  setClients: Dispatch<SetStateAction<CachedClient[]>>;
  setAllOperations: Dispatch<SetStateAction<OutboxOperation[]>>;
  setLocalPhotos: Dispatch<SetStateAction<LocalPhoto[]>>;
  setPendingPhotoCount: Dispatch<SetStateAction<number>>;
  setQueued: Dispatch<SetStateAction<number>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setHistoryPage: Dispatch<SetStateAction<number>>;
  setHistoryHasMore: Dispatch<SetStateAction<boolean>>;
  setMessage: (message: string) => void;
};

/** Owns the nurse's local cache refresh and the foreground/background sync lifecycle. */
export function useNurseOfflineSync(options: NurseOfflineSyncOptions) {
  const {
    token, wifiOnlyUpload, applyProfile, loadProfile, refreshCareForms, setOnline,
    setVisits, setHistory, setClients, setAllOperations, setLocalPhotos,
    setPendingPhotoCount, setQueued, setBusy, setHistoryPage, setHistoryHasMore, setMessage,
  } = options;
  const syncInFlight = useRef(false);
  const manualPhotoUploadOverride = useRef<string | null>(null);
  const careRefreshRef = useRef(refreshCareForms);
  careRefreshRef.current = refreshCareForms;

  const refreshLocal = useCallback(async () => {
    const cachedVisits = await listCachedVisits();
    const today = kampalaDateKey(new Date());
    setVisits(cachedVisits.filter((visit) => kampalaDateKey(visit.scheduled_start) === today || visit.status === 'in_progress'));
    setHistory(await listCachedHistory());
    setClients(await listCachedClients());
    const ownerId = localStorage.getItem('nest.nurse.cache-user-id') ?? '';
    const operations = await nurseDb.outbox.toArray();
    const photos = (await nurseDb.photos.toArray()).filter((photo) => photo.ownerUserId === ownerId && Boolean(ownerId));
    setAllOperations(operations);
    setLocalPhotos(photos);
    setPendingPhotoCount(photos.length);
    setQueued(
      operations.filter((operation) => operation.ownerUserId === ownerId && operation.state === 'queued').length +
      photos.filter((photo) => photo.state === 'queued').length,
    );
  }, [
    setVisits,
    setHistory,
    setClients,
    setAllOperations,
    setLocalPhotos,
    setPendingPhotoCount,
    setQueued,
  ]);

  const sync = useCallback(async () => {
    if (!navigator.onLine || !sessionStorage.getItem('nurse_access_token') || syncInFlight.current) return;
    syncInFlight.current = true;
    const networkConnection = (navigator as Navigator & { connection?: { type?: string } }).connection;
    const canUpload = canUploadPhoto(wifiOnlyUpload, navigator.onLine, networkConnection);
    const forcePhotoUploadId = manualPhotoUploadOverride.current;
    manualPhotoUploadOverride.current = null;
    setBusy(true);
    setMessage(copy.messages.syncStarted);
    try {
      await recoverInterruptedOperations();
      await recoverInterruptedPhotos();
      const syncResult = await runSync({
        apiRequest,
        getProfile: loadProfile,
        applyProfile: applyProfile,
        updateVisit: updateCachedVisit,
        beforeOperations: async (profile) => {
          // Register required photo evidence after consent checks and before checkout writes.
          const queuedPhotos = canUpload || forcePhotoUploadId ? await listQueuedPhotos() : [];
          const queuedPhotosDue = queuedPhotos.filter((photo) =>
            canUpload ? !forcePhotoUploadId || photo.id === forcePhotoUploadId : photo.id === forcePhotoUploadId,
          );
          const completedPhotoTypes = new Map<string, Array<'arrival' | 'departure' | 'other'>>();
          for (const photo of queuedPhotosDue) {
            if (photo.ownerUserId !== profile.user_id) {
              await updateLocalPhoto(photo.id, { state: 'needs_attention', lastError: copy.sync.failures.accountMismatch });
              continue;
            }
            await updateLocalPhoto(photo.id, { state: 'sending', attempts: photo.attempts + 1 });
            try {
              if (photo.uploadStage !== 'uploaded') {
                const signed = await apiRequest<{
                  upload_url: string;
                  api_key: string;
                  timestamp: number;
                  folder: string;
                  public_id: string;
                  signature: string;
                }>('/field/photos/sign', {
                  method: 'POST',
                  body: JSON.stringify({
                    id: photo.id,
                    visit_id: photo.visitId,
                    content_type: photo.mime,
                    bytes: photo.blob.size,
                    photo_type: photo.photoType ?? 'other',
                  }),
                });
                const form = new FormData();
                form.append('file', new File([photo.blob], `${photo.id}.jpg`, { type: photo.mime }));
                form.append('api_key', signed.api_key);
                form.append('timestamp', String(signed.timestamp));
                form.append('folder', signed.folder);
                form.append('public_id', signed.public_id);
                form.append('signature', signed.signature);
                const upload = await fetch(signed.upload_url, { method: 'POST', body: form });
                if (!upload.ok) throw Object.assign(new Error(copy.photos.uploadRejected), { status: upload.status });
                await updateLocalPhoto(photo.id, { uploadStage: 'uploaded' });
              }
              await apiRequest('/field/photos/complete', { method: 'POST', body: JSON.stringify({ id: photo.id }) });
              const types = completedPhotoTypes.get(photo.visitId) ?? [];
              types.push(photo.photoType ?? 'other');
              completedPhotoTypes.set(photo.visitId, types);
              await removeLocalPhoto(photo.id);
            } catch (error) {
              const retryable = isRetryableSyncFailure(error);
              const detail = syncFailureMessage(error, copy.sync.failures.photoUnavailable);
              await updateLocalPhoto(photo.id, {
                state: retryable ? 'queued' : 'needs_attention',
                lastError: detail,
                retryAfter: retryable ? retryAfterIso(photo.attempts + 1) : undefined,
              });
              if (retryable) break;
            }
          }

          const queuedOperations = await nurseDb.outbox.toArray();
          const blockedCheckoutVisitIds: string[] = [];
          for (const operation of queuedOperations.filter((item) => item.kind === 'check_out' && item.state === 'queued' && Boolean(item.visitId))) {
            const visit = await nurseDb.visits.get(operation.visitId!);
            if (!visit) continue;
            const mode = visit.photo_rules?.required_mode ?? (visit.photo_rules?.required_on_checkout ? 'departure' : profile.settings?.photo_required ?? 'none');
            const photoTypes = [...(visit.photo_types ?? []), ...(completedPhotoTypes.get(visit.id) ?? [])];
            if (checkoutPhotoRequirementMissing(mode, photoTypes)) blockedCheckoutVisitIds.push(visit.id);
          }
          return { blockedCheckoutVisitIds };
        },
      });
      const profile = syncResult.profile as FieldProfile;
      manualPhotoUploadOverride.current = null;
      if (syncResult.consentBlocked) {
        await refreshLocal();
        setMessage(copy.messages.consentBlocked);
        return;
      }

      const pulled = await pullSyncPages({
        apiRequest,
        getCursor: () => getSyncCursor(profile.user_id),
        applyPage: (page) => applySyncPullPage(page, profile.user_id),
        maxPages: 25,
        pageSize: 200,
      });
      const historyResult = await apiRequest<{ items: CachedHistoryVisit[]; page?: number; page_size?: number }>('/field/history?page=1&page_size=50');
      await cacheHistory(historyResult.items);
      setHistoryPage(1);
      setHistoryHasMore(historyResult.items.length === 50);
      const clientResult = await apiRequest<{ items: CachedClient[] }>('/field/clients');
      await cacheClients(clientResult.items);
      void careRefreshRef.current(); // Keep signed documents available for offline use.
      await refreshLocal();
      setMessage(syncResult.photoRequirementBlockedCount > 0
        ? copy.photos.requiredUploadPending
        : !canUpload && wifiOnlyUpload
          ? copy.messages.syncPausedPhotos
          : pulled.hasMore
            ? copy.messages.syncMore
            : copy.messages.syncComplete);
    } catch {
      await refreshLocal();
      setMessage(copy.messages.syncFailed);
    } finally {
      syncInFlight.current = false;
      setBusy(false);
    }
  }, [applyProfile, loadProfile, refreshLocal, wifiOnlyUpload, setBusy, setMessage, setHistoryPage, setHistoryHasMore]);

  useEffect(() => {
    let active = true;
    const onOnline = () => {
      setOnline(true);
      void sync();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    void refreshLocal();
    if (navigator.onLine && token) void sync();
    const syncInterval = window.setInterval(() => {
      if (navigator.onLine && token) void sync();
    }, 5 * 60 * 1000);
    let appStateHandle: { remove: () => Promise<void> } | undefined;
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          setOnline(navigator.onLine);
          if (navigator.onLine && token) void sync();
        }
      }).then((handle) => {
        if (!active) void handle.remove();
        else appStateHandle = handle;
      }).catch(() => undefined);
    }
    return () => {
      active = false;
      void appStateHandle?.remove();
      window.clearInterval(syncInterval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [setOnline, token, refreshLocal, sync]);

  return { refreshLocal, sync, syncInFlight, manualPhotoUploadOverride };
}
