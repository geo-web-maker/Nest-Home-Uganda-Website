import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import { apiRequest, restoreNativeSession } from '../lib/api/client';
import { LogoutGuard } from './LogoutGuard';
import { needsLogoutConfirmation } from './logoutGuard';
import { isRemovedVisitConflict, isRetryableSyncFailure, retryAfterIso, syncFailureMessage } from '../offline/syncPolicy';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { registerForPush, type StopPushRegistration } from '../platform/push';
import { enableVisitReminders, scheduleVisitReminders } from '../platform/notify';
import { compressPhotoBundle, PHOTO_MAX_BYTES } from '../features/photos/compress';
import { readRefreshToken } from '../platform/secureTokenStorage';
import { kampalaDateKey } from '../lib/time';
import { applySyncPullPage, cacheClients, cacheHistory, clearSyncCursor, enqueueOperation, enqueuePhoto, getSyncCursor, listCachedClients, listCachedHistory, listCachedVisits, listQueuedPhotos, nurseDb, recoverInterruptedOperations, recoverInterruptedPhotos, removeLocalPhoto, updateCachedVisit, updateLocalPhoto, type CachedClient, type CachedHistoryVisit, type CachedVisit, type LocalPhoto, type OutboxOperation } from '../offline/db';
import { runSync } from '../offline/syncEngine';
import { pullSyncPages } from '../offline/pullSyncPages';
import { canUploadPhoto } from '../features/photos/uploadPolicy';
import { buildSosSmsBody, buildSosSmsHref } from '../features/sos/sosMessage';
import { captureLocation, captureLocationWithStatus, type LocationSnapshot } from '../platform/location';
import { useSession } from './useSession';
import { useFieldProfile, type FieldConsentRequirement, type FieldProfile } from './useFieldProfile';
import { useHeartbeat } from '../features/heartbeat/useHeartbeat';
import { copy, APP_VERSION } from '../copy';
import { AppShell } from './AppShell';
import { NurseRoutes } from './routes';
import { LoginScreen } from '../screens/LoginScreen';
import { Onboarding } from '../screens/Onboarding';
import { TodayScreen } from '../screens/TodayScreen';
import { VisitDetail } from '../screens/VisitDetail';
import { ArriveSheet } from '../screens/ArriveSheet';
import { LeaveSheet } from '../screens/LeaveSheet';
import { ActiveVisit } from '../screens/ActiveVisit';
import { NoteSheet } from '../screens/NoteSheet';
import { PhotoSheet } from '../screens/PhotoSheet';
import { HistoryScreen } from '../screens/HistoryScreen';
import { SyncScreen } from '../screens/SyncScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { isForcedUpdate } from '../lib/version';
import { UpdateNotice } from '../features/update/UpdateNotice';
import { SafetyTimerPrompt } from '../screens/SafetyTimerPrompt';

type ConsentRequirement = FieldConsentRequirement;
function makeId() { return globalThis.crypto?.randomUUID?.() ?? `op-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
async function currentLocation(): Promise<LocationSnapshot> { return captureLocation(); }

export function App() { return <BrowserRouter><NurseWorkspace /></BrowserRouter>; }

function NurseWorkspace() {
  const stopPushRegistration = useRef<StopPushRegistration | null>(null);
  const actionBusyRef = useRef(false);
  const navigate = useNavigate();
  const session = useSession();
  const { profile: fieldProfile, setProfile: setFieldProfile, loadProfile, clearProfile } = useFieldProfile();
  const syncInFlight = useRef(false);
  const manualPhotoUploadOverride = useRef<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [visitRemindersEnabled, setVisitRemindersEnabled] = useState(localStorage.getItem('nest.nurse.visit-reminders') === 'true');
  const [pendingAdhocStart, setPendingAdhocStart] = useState(false);
  const [visits, setVisits] = useState<CachedVisit[]>([]);
  const [queued, setQueued] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const token = session.token;
  const setToken = session.setToken;
  const [currentUserId, setCurrentUserId] = useState('');
  const [consentsRequired, setConsentsRequired] = useState<ConsentRequirement[]>([]);
  const [allOperations, setAllOperations] = useState<OutboxOperation[]>([]);
  const [localPhotos, setLocalPhotos] = useState<LocalPhoto[]>([]);
  const [wifiOnlyUpload, setWifiOnlyUpload] = useState(localStorage.getItem('nest.nurse.wifi-only-photos') === 'true');
  const [locationDisclosureAccepted, setLocationDisclosureAccepted] = useState(localStorage.getItem('nest.nurse.location-disclosure') === 'true');
  const [actionVisit, setActionVisit] = useState<CachedVisit | null>(null);
  const [actionKind, setActionKind] = useState<'check_in' | 'check_out' | null>(null);
  const [actionLocation, setActionLocation] = useState<LocationSnapshot | null>(null);
  const [actionLocationState, setActionLocationState] = useState<'acquiring' | 'good' | 'low_accuracy' | 'denied' | 'unavailable'>('acquiring');
  const [actionBusy, setActionBusy] = useState(false);
  const [safetyTimerEnabled, setSafetyTimerEnabled] = useState(false);
  const [actionFinalNote, setActionFinalNote] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [pendingAction, setPendingAction] = useState<{ visit: CachedVisit; kind: 'check_in' | 'check_out' } | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [versionInfo, setVersionInfo] = useState<{ latest: string; min_supported: string; download_path?: string | null } | null>(null);
  const [inbox, setInbox] = useState<Array<{ id: string; title: string; body: string; created_at?: string }>>([]);
  const [inboxMessage, setInboxMessage] = useState('');
  const [sosSmsHref, setSosSmsHref] = useState(() => buildSosSmsHref(buildSosSmsBody()));
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [history, setHistory] = useState<CachedHistoryVisit[]>([]);
  const [clients, setClients] = useState<CachedClient[]>([]);
  const [adhocAllowed, setAdhocAllowed] = useState(false);
  const [adhocOpen, setAdhocOpen] = useState(false);
  const [adhocClientId, setAdhocClientId] = useState('');
  const [photoVisitId, setPhotoVisitId] = useState('');
  const [photosEnabled, setPhotosEnabled] = useState(localStorage.getItem('nest.nurse.photos-enabled') === 'true');
  const [sosEnabled, setSosEnabled] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [pendingPhotoCount, setPendingPhotoCount] = useState(0);
  const [logoutGuardOpen, setLogoutGuardOpen] = useState(false);
  const [logoutPendingCount, setLogoutPendingCount] = useState(0);
  const [noteVisitId, setNoteVisitId] = useState('');
  const [noteBody, setNoteBody] = useState('');
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
  }, []);
  const applyProfile = useCallback(async (profile: FieldProfile) => {
    setCurrentUserId(profile.user_id);
    setConsentsRequired(profile.consents_required ?? []);
    setAdhocAllowed(Boolean(profile.settings?.adhoc_allowed));
    setPhotosEnabled(Boolean(profile.settings?.photos_enabled));
    setSosEnabled(Boolean(profile.settings?.sos_enabled));
    setFieldProfile(profile);
    localStorage.setItem('nest.nurse.photos-enabled', String(Boolean(profile.settings?.photos_enabled)));
    localStorage.setItem('nest.nurse.photo-max-mb', String(profile.settings?.photo_max_mb ?? 5));
  }, [setFieldProfile]);
  const sync = useCallback(async () => {
    if (!navigator.onLine || !sessionStorage.getItem('nurse_access_token') || syncInFlight.current) return;
    syncInFlight.current = true;
    const forcePhotoUploadId = manualPhotoUploadOverride.current;
    manualPhotoUploadOverride.current = null;
    setBusy(true);
    setMessage(copy.messages.syncStarted);
    try {
      await recoverInterruptedOperations();
      await recoverInterruptedPhotos();
      const syncResult = await runSync({ apiRequest, getProfile: loadProfile, applyProfile, updateVisit: updateCachedVisit });
      const profile = syncResult.profile as FieldProfile;
      if (syncResult.consentBlocked) {
        await refreshLocal();
        setMessage(copy.messages.consentBlocked);
        return;
      }

      const networkConnection = (navigator as Navigator & { connection?: { type?: string } }).connection;
      // A nurse may deliberately override Wi-Fi-only for one selected photo only.
      const canUpload = canUploadPhoto(wifiOnlyUpload, navigator.onLine, networkConnection);
      const queuedPhotos = canUpload || forcePhotoUploadId ? await listQueuedPhotos() : [];
      const queuedPhotosDue = queuedPhotos.filter((photo) =>
        canUpload ? !forcePhotoUploadId || photo.id === forcePhotoUploadId : photo.id === forcePhotoUploadId,
      );
      for (const photo of queuedPhotosDue) {
        if (photo.ownerUserId !== profile.user_id) {
          await updateLocalPhoto(photo.id, { state: 'needs_attention', lastError: copy.sync.failures.accountMismatch });
          continue;
        }
        await updateLocalPhoto(photo.id, { state: 'sending', attempts: photo.attempts + 1 });
        try {
          if (photo.uploadStage !== 'uploaded') {
            const signed = await apiRequest<{ upload_url: string; api_key: string; timestamp: number; folder: string; public_id: string; signature: string }>('/field/photos/sign', { method: 'POST', body: JSON.stringify({ id: photo.id, visit_id: photo.visitId, content_type: photo.mime, bytes: photo.blob.size }) });
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
          await removeLocalPhoto(photo.id);
        } catch (error) {
          const retryable = isRetryableSyncFailure(error);
          const detail = syncFailureMessage(error, copy.sync.failures.photoUnavailable);
          await updateLocalPhoto(photo.id, { state: retryable ? 'queued' : 'needs_attention', lastError: detail, retryAfter: retryable ? retryAfterIso(photo.attempts + 1) : undefined });
          if (retryable) break;
        }
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
      await refreshLocal();
      setMessage(!canUpload && wifiOnlyUpload
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
  }, [applyProfile, loadProfile, refreshLocal, wifiOnlyUpload]);
  useEffect(() => {
    let active = true;
    const onOnline = () => { setOnline(true); void sync(); };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    void refreshLocal(); if (navigator.onLine && token) void sync();
    const syncInterval = window.setInterval(() => { if (navigator.onLine && token) void sync(); }, 5 * 60 * 1000);
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
  }, [refreshLocal, sync, token]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !token || !visitRemindersEnabled) return;
    void scheduleVisitReminders(visits).catch(() => setMessage(copy.messages.remindersRefreshFailed));
  }, [token, visitRemindersEnabled, visits]);
  useEffect(() => {
    // Persistence is a best-effort enhancement. The app still handles storage denial gracefully.
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
  }, []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || sessionStorage.getItem('nurse_access_token')) return;
    let active = true;
    void restoreNativeSession().then((restored) => {
      if (active && restored) { setToken(restored); setMessage(copy.messages.sessionRestored); }
    }).catch(() => {
      if (active) setMessage(copy.messages.sessionRestoreFailed);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => () => { void stopPushRegistration.current?.(); }, []);
  async function registerPushIfOptedIn(userId = currentUserId) {
    if (!Capacitor.isNativePlatform() || !sessionStorage.getItem('nurse_access_token') || !userId) return;
    const deviceKey = `nest.nurse.device-id:${userId}`;
    const legacyDeviceId = localStorage.getItem('nest.nurse.device-id');
    const deviceId = localStorage.getItem(deviceKey) ?? legacyDeviceId ?? globalThis.crypto?.randomUUID?.() ?? `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(deviceKey, deviceId);
    if (legacyDeviceId) localStorage.removeItem('nest.nurse.device-id');
    try {
      try { await stopPushRegistration.current?.(); } catch { /* Keep current session usable if listener cleanup fails. */ }
      stopPushRegistration.current = null;
      const stop = await registerForPush(async (pushToken) => {
        await apiRequest('/field/devices', { method: 'POST', body: JSON.stringify({ device_id: deviceId, platform: Capacitor.getPlatform(), push_token: pushToken }) });
      }, {
        onReceived: () => { void sync(); setMessage(copy.messages.notificationReceived); },
        onAction: (action) => {
          void sync();
          const deepLink = action.notification.data?.deep_link;
          setMessage(typeof deepLink === 'string' ? copy.messages.notificationOpened : copy.messages.notificationOpenedSyncing);
        },
      });
      stopPushRegistration.current = stop ?? null;
    } catch {
      setMessage(copy.messages.pushUnavailable);
    }
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(copy.messages.signInProgress);
    try {
      await session.signIn(identifier, password);
      setPassword('');
      // A prior explicit notification choice is the only reason to re-register push at sign-in.
      const profile = await loadProfile();
      await applyProfile(profile);
      if (visitRemindersEnabled) void registerPushIfOptedIn(profile.user_id);
      setMessage(copy.messages.signedIn);
      if ((profile.consents_required ?? []).length === 0) await sync();
    } catch {
      setMessage(copy.login.failed);
    } finally {
      setBusy(false);
    }
  }
  async function requestSignOut() {
    const pendingItems = (await nurseDb.outbox.count()) + (await nurseDb.photos.count());
    if (needsLogoutConfirmation(pendingItems)) {
      setLogoutPendingCount(pendingItems);
      setLogoutGuardOpen(true);
      return;
    }
    await signOut();
  }
  async function signOut() {
    let remoteRevoked = false;
    try { await stopPushRegistration.current?.(); } catch { /* Local sign-out must still complete. */ }
    stopPushRegistration.current = null;
    if (Capacitor.isNativePlatform() && currentUserId && navigator.onLine && sessionStorage.getItem('nurse_access_token')) {
      const deviceKey = `nest.nurse.device-id:${currentUserId}`;
      const deviceId = localStorage.getItem(deviceKey);
      if (deviceId) {
        try {
          await apiRequest('/field/device/revoke', { method: 'POST', body: JSON.stringify({ device_id: deviceId }) });
          localStorage.removeItem(deviceKey);
        } catch { /* If offline or the request fails, preserve the id for a later same-user retry. */ }
      }
    }
    try { await scheduleVisitReminders([]); } catch { /* Local sign-out must still complete. */ }
    setVisitRemindersEnabled(false); localStorage.setItem('nest.nurse.visit-reminders', 'false');
    if (Capacitor.isNativePlatform()) {
      try {
        const refreshToken = await readRefreshToken();
        if (refreshToken && navigator.onLine) {
          await apiRequest('/auth/native/logout', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) });
          remoteRevoked = true;
        }
      } catch { remoteRevoked = false; }
    } else {
      const csrf = sessionStorage.getItem('nurse_csrf_token');
      if (csrf && navigator.onLine) {
        try { await apiRequest('/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrf } }); remoteRevoked = true; }
        catch { remoteRevoked = false; }
      }
    }
    await session.signOutLocal();
    clearProfile();
    await clearSyncCursor(currentUserId);
    await nurseDb.visits.clear(); await nurseDb.history.clear(); await nurseDb.clients.clear(); await nurseDb.consents.clear();
    localStorage.removeItem('nest.nurse.cache-user-id');
    setCurrentUserId(''); setConsentsRequired([]); setAdhocAllowed(false); setPhotosEnabled(false); setSosEnabled(false); setAdhocOpen(false); setPhotoVisitId(''); setNoteVisitId(''); setActionVisit(null); setActionKind(null); setSafetyTimerEnabled(false); setLogoutGuardOpen(false); setLogoutPendingCount(0); setAllOperations([]); setLocalPhotos([]); setQueued(0); setPendingPhotoCount(0);
    setMessage(remoteRevoked ? copy.messages.signOutRemote : copy.messages.signOutLocal);
  }
  async function acceptConsent(requirement: ConsentRequirement) {
    const now = new Date().toISOString(); const id = makeId();
    await nurseDb.consents.put({ id: `${requirement.type}:${requirement.version}`, type: requirement.type, version: requirement.version, acceptedAt: now });
    await enqueueOperation({ id, kind: 'consent', ownerUserId: currentUserId, payload: { type: requirement.type, version: requirement.version }, createdAt: now });
    setConsentsRequired((old) => old.filter((item) => item.type !== requirement.type));
    setMessage(copy.messages.consentSaved);
    if (navigator.onLine) void sync();
  }
  async function retrySavedOperation(id: string) {
    await nurseDb.outbox.update(id, { state: 'queued', lastError: undefined, retryAfter: undefined });
    await refreshLocal();
    setMessage(copy.messages.retryQueued);
    if (navigator.onLine) void sync();
  }
  async function discardRemovedVisitOperation(id: string) {
    await nurseDb.meta.put({ key: `discard-audit:${Date.now()}:${id}`, value: JSON.stringify({ kind: 'outbox', item_id: id, discarded_at: new Date().toISOString(), reason: 'Removed or reassigned visit; user confirmed discard.' }) });
    await nurseDb.outbox.delete(id);
    await refreshLocal();
    setMessage(copy.messages.removedDiscarded);
  }
  async function retrySavedPhoto(id: string) {
    await updateLocalPhoto(id, { state: 'queued', lastError: undefined, retryAfter: undefined });
    await refreshLocal();
    setMessage(copy.messages.photoRetry);
    if (navigator.onLine) void sync();
  }
  async function savePhoto(event: FormEvent) {
    event.preventDefault();
    if (!photoVisitId || !photoFile) return;
    const visit = visits.find((item) => item.id === photoVisitId);
    if (!photosEnabled || !visit?.photo_rules?.allowed) { setMessage(copy.photos.notEnabled); return; }
    try {
      if (pendingPhotoCount >= 20) setMessage(copy.photos.tooMany);
      const storage = navigator.storage;
      if (storage?.estimate) {
        const estimate = await storage.estimate();
        const available = typeof estimate.quota === 'number' && typeof estimate.usage === 'number' ? estimate.quota - estimate.usage : undefined;
        if (available !== undefined && available < PHOTO_MAX_BYTES * 2) throw new Error(copy.photos.insufficientStorage);
      }
      const prepared = await compressPhotoBundle(photoFile);
      const id = makeId();
      await enqueuePhoto({ id, visitId: photoVisitId, ownerUserId: currentUserId, blob: prepared.image, thumbnail: prepared.thumbnail, mime: 'image/jpeg', uploadStage: 'pending_upload', createdAt: new Date().toISOString() });
      setPhotoVisitId(''); setPhotoFile(null); await refreshLocal();
      setMessage(copy.photos.saved);
      if (navigator.onLine) void sync();
    } catch (error) { setMessage(error instanceof Error ? error.message : copy.photos.failed); }
  }
  async function startAdhocVisit(event: FormEvent) {
    event.preventDefault();
    if (!clients.some((item) => item.id === adhocClientId)) return;
    if (!locationDisclosureAccepted) {
      setPendingAdhocStart(true);
      navigate('/onboarding');
      return;
    }
    await createAdhocVisit();
  }

  async function createAdhocVisit() {
    const client = clients.find((item) => item.id === adhocClientId);
    if (!client) { navigate('/'); return; }
    const now = new Date().toISOString(); const id = makeId();
    const location = await captureLocationWithStatus();
    const payload = { id, client_op_id: id, client_id: client.id, device_time: now, sent_at_device: now, ...location.snapshot, source: Capacitor.isNativePlatform() ? 'app_manual' : 'pwa_manual', device_info: { user_agent: navigator.userAgent } };
    const localVisit: Omit<CachedVisit, 'updatedAt'> = { id, client_display_name: client.display_name, place_address_text: '', scheduled_start: now, scheduled_end: new Date(Date.now() + 60 * 60 * 1000).toISOString(), status: 'in_progress', instructions: '', adhoc: true, check_in_at: now, check_out_at: null, verification_label: 'pending_sync', safety_state: 'off' };
    await cacheVisits([...visits.filter((visit) => visit.id !== id), localVisit]);
    await enqueueOperation({ id, kind: 'visit_create_adhoc', ownerUserId: currentUserId, payload, createdAt: now });
    setAdhocOpen(false); setAdhocClientId(''); await refreshLocal();
    setMessage(copy.messages.adhocSaved);
    navigate('/');
    if (navigator.onLine) void sync();
  }
  async function saveVisitNote(event: FormEvent) {
    event.preventDefault();
    const visitId = noteVisitId;
    const body = noteBody.trim();
    if (!visitId || !body) return;
    const now = new Date().toISOString(); const id = makeId();
    await enqueueOperation({ id, kind: 'visit_note', visitId, ownerUserId: currentUserId, payload: { id, client_op_id: id, body, created_at_device: now, geo_snap: {} }, createdAt: now });
    setNoteBody(''); setNoteVisitId(''); await refreshLocal();
    setMessage(copy.messages.noteSaved);
    if (navigator.onLine) void sync();
  }

  async function visitAction(
    visit: CachedVisit,
    kind: 'check_in' | 'check_out',
    locationOverride?: LocationSnapshot | null,
    safetyTimerMinutes?: number,
    finalNote = '',
  ) {
    const snapshot = locationOverride ?? { lat: null, lng: null, accuracy_m: 0 };
    const now = new Date().toISOString();
    const id = makeId();
    const payload = {
      id, client_op_id: id, device_time: now, sent_at_device: now, ...snapshot,
      source: Capacitor.isNativePlatform() ? 'app_manual' : 'pwa_manual',
      device_info: { user_agent: navigator.userAgent },
      ...(kind === 'check_in' && safetyTimerMinutes ? { safety_timer_minutes: safetyTimerMinutes } : {}),
    };
    const safetyTimerUntil = kind === 'check_in' && safetyTimerMinutes
      ? new Date(Date.parse(visit.scheduled_end) + safetyTimerMinutes * 60_000).toISOString()
      : undefined;
    const operations: OutboxOperation[] = [{
      id, kind, visitId: visit.id, ownerUserId: currentUserId, payload, createdAt: now, state: 'queued', attempts: 0,
    }];
    if (kind === 'check_out' && finalNote.trim()) {
      const noteId = makeId();
      operations.push({
        id: noteId, kind: 'visit_note', visitId: visit.id, ownerUserId: currentUserId,
        payload: { id: noteId, client_op_id: noteId, body: finalNote.trim(), created_at_device: now, geo_snap: {} },
        createdAt: now, state: 'queued', attempts: 0,
      });
    }
    const visitPatch: Partial<CachedVisit> = kind === 'check_in'
      ? {
          status: 'in_progress', check_in_at: now, safety_checkout_pending: false,
          ...(safetyTimerUntil ? { safety_timer_until: safetyTimerUntil, safety_state: 'armed', safety_timer_sync_state: 'pending_sync' as const } : {}),
        }
      : {
          status: 'completed', check_out_at: now,
          safety_checkout_pending: visit.safety_state === 'armed',
          // Do not clear the local safety state until the server accepts checkout and pull confirms it.
          safety_state: visit.safety_state ?? 'off',
          ...(visit.safety_timer_until ? { safety_timer_until: visit.safety_timer_until } : {}),
        };
    await nurseDb.transaction('rw', nurseDb.outbox, nurseDb.visits, async () => {
      await nurseDb.outbox.bulkPut(operations);
      await nurseDb.visits.update(visit.id, { ...visitPatch, updatedAt: now });
    });
    await refreshLocal();
    setMessage(kind === 'check_out' && visit.safety_state === 'armed'
      ? copy.messages.checkoutQueuedSafetyTimer
      : copy.visit.savedOffline);
    if (navigator.onLine) void sync();
  }

  function openActionSheet(visit: CachedVisit, kind: 'check_in' | 'check_out') {
    setActionVisit(visit);
    setActionKind(kind);
    setActionLocation(null);
    setActionLocationState('acquiring');
    setActionFinalNote('');
    setActionBusy(false);
    navigate('/');
    void captureLocationWithStatus().then((result) => {
      setActionLocation(result.snapshot);
      setActionLocationState(result.state);
    }).catch(() => {
      setActionLocation({ lat: null, lng: null, accuracy_m: 0 });
      setActionLocationState('unavailable');
    });
  }

  function requestVisitAction(visit: CachedVisit, kind: 'check_in' | 'check_out') {
    setPendingAction({ visit, kind });
    if (!locationDisclosureAccepted) {
      navigate('/onboarding');
      return;
    }
    setPendingAction(null);
    openActionSheet(visit, kind);
  }

  function acceptLocationDisclosure() {
    localStorage.setItem('nest.nurse.location-disclosure', 'true');
    setLocationDisclosureAccepted(true);
  }

  function continueOnboarding() {
    const nextAction = pendingAction;
    const startAdhoc = pendingAdhocStart;
    setPendingAction(null);
    setPendingAdhocStart(false);
    if (nextAction) openActionSheet(nextAction.visit, nextAction.kind);
    else if (startAdhoc) void createAdhocVisit();
    else navigate('/');
  }

  async function confirmVisitAction() {
    if (!actionVisit || !actionKind || actionBusyRef.current) return;
    actionBusyRef.current = true;
    setActionBusy(true);
    try {
      const timerMinutes = actionKind === 'check_in' && safetyTimerEnabled ? 15 : undefined;
      await visitAction(actionVisit, actionKind, actionLocation ?? { lat: null, lng: null, accuracy_m: 0 }, timerMinutes, actionKind === 'check_out' ? actionFinalNote : '');
      setActionVisit(null);
      setActionKind(null);
      setActionFinalNote('');
      setSafetyTimerEnabled(false);
      navigate('/');
    } finally {
      actionBusyRef.current = false;
      setActionBusy(false);
    }
  }

  function openNote(visit: CachedVisit) { setNoteVisitId(visit.id); setNoteBody(''); }
  function openPhoto(visit: CachedVisit) { setPhotoVisitId(visit.id); setPhotoFile(null); }

  async function discardSavedOperation(id: string) {
    const operation = await nurseDb.outbox.get(id);
    if (operation && isRemovedVisitConflict(operation.lastError)) await discardRemovedVisitOperation(id);
    else {
      await nurseDb.meta.put({ key: `discard-audit:${Date.now()}:${id}`, value: JSON.stringify({ kind: 'outbox', item_id: id, discarded_at: new Date().toISOString(), reason: 'User confirmed discard from Sync status.' }) });
      await nurseDb.outbox.delete(id);
      await refreshLocal();
      setMessage(copy.messages.actionDiscarded);
    }
  }

  async function discardSavedPhoto(id: string) {
    await nurseDb.meta.put({ key: `discard-audit:${Date.now()}:${id}`, value: JSON.stringify({ kind: 'photo', item_id: id, discarded_at: new Date().toISOString(), reason: 'User confirmed discard from Sync status.' }) });
    await removeLocalPhoto(id);
    await refreshLocal();
    setMessage(copy.messages.photoDiscarded);
  }

  async function applySavedOperationAgain(operation: OutboxOperation) {
    if (isRemovedVisitConflict(operation.lastError) || /adhoc_disabled|visit_not_assigned|no longer assigned/i.test(operation.lastError ?? '')) {
      setMessage(copy.messages.applyAgainBlocked);
      return;
    }
    const newId = makeId();
    const now = new Date().toISOString();
    const payload = { ...operation.payload, id: newId, client_op_id: newId };
    // Replace the rejected identifier and optimistic visit state as one local transaction.
    await nurseDb.transaction('rw', nurseDb.outbox, nurseDb.visits, async () => {
      await nurseDb.outbox.put({ id: newId, kind: operation.kind, visitId: operation.visitId, ownerUserId: currentUserId, payload, createdAt: now, state: 'queued', attempts: 0 });
      if (operation.visitId && operation.kind === 'check_in') {
        const visit = await nurseDb.visits.get(operation.visitId);
        const minutes = typeof payload.safety_timer_minutes === 'number' ? payload.safety_timer_minutes : undefined;
        await nurseDb.visits.update(operation.visitId, {
          status: 'in_progress', check_in_at: typeof payload.device_time === 'string' ? payload.device_time : now,
          ...(minutes && visit ? { safety_state: 'armed', safety_timer_until: new Date(Date.parse(visit.scheduled_end) + minutes * 60_000).toISOString(), safety_timer_sync_state: 'pending_sync' as const, safety_checkout_pending: false } : {}),
          updatedAt: now,
        });
      }
      if (operation.visitId && operation.kind === 'check_out') {
        const visit = await nurseDb.visits.get(operation.visitId);
        await nurseDb.visits.update(operation.visitId, {
          status: 'completed', check_out_at: typeof payload.device_time === 'string' ? payload.device_time : now,
          safety_checkout_pending: visit?.safety_state === 'armed', updatedAt: now,
        });
      }
      await nurseDb.outbox.delete(operation.id);
    });
    await refreshLocal();
    setMessage(copy.messages.actionRequeued);
    if (navigator.onLine) void sync();
  }

  async function uploadPhotoNow(id: string) {
    if (!navigator.onLine || syncInFlight.current) {
      setMessage(copy.messages.photoUploadBlocked);
      return;
    }
    await updateLocalPhoto(id, { state: 'queued', lastError: undefined, retryAfter: undefined });
    manualPhotoUploadOverride.current = id;
    await refreshLocal();
    await sync();
  }

  async function loadMoreHistory() {
    if (historyLoading || !navigator.onLine) return;
    setHistoryLoading(true);
    try {
      const page = historyPage + 1;
      const result = await apiRequest<{ items: CachedHistoryVisit[]; page?: number; page_size?: number }>(`/field/history?page=${page}&page_size=50`);
      await cacheHistory(result.items);
      setHistory((old) => [...old, ...result.items.filter((item) => !old.some((saved) => saved.id === item.id))]);
      setHistoryPage(page);
      setHistoryHasMore(result.items.length === 50);
    } catch { setMessage(copy.messages.historyUnavailable); }
    finally { setHistoryLoading(false); }
  }

  async function checkForUpdate() {
    try {
      const platform = Capacitor.getPlatform();
      const version = await apiRequest<{ latest: string; min_supported: string; download_path?: string | null }>(`/field/app/version?platform=${platform === 'ios' || platform === 'android' ? platform : 'web'}`);
      setVersionInfo(version);
      setMessage(copy.messages.versionRefreshed);
    } catch { setMessage(copy.messages.updateUnavailable); }
  }

  async function enableReminders() {
    try {
      // The explicit opt-in is the permission boundary for both local reminders and push.
      const enabled = await enableVisitReminders();
      setVisitRemindersEnabled(enabled);
      localStorage.setItem('nest.nurse.visit-reminders', String(enabled));
      if (enabled) await scheduleVisitReminders(visits);
      if (Capacitor.isNativePlatform() && enabled) await registerPushIfOptedIn();
      setMessage(enabled ? copy.messages.remindersEnabled : copy.messages.remindersNotEnabled);
    } catch { setMessage(copy.messages.notificationsUnavailable); }
  }
  async function disableReminders() {
    setVisitRemindersEnabled(false);
    localStorage.setItem('nest.nurse.visit-reminders', 'false');
    try { await scheduleVisitReminders([]); } catch { /* Turning the preference off must remain available. */ }
    setMessage(copy.messages.remindersDisabled);
  }

  async function sendSos() {
    const now = new Date();
    const id = makeId();
    const active = visits.find((visit) => visit.status === 'in_progress');
    const payload = { id, ...(active ? { visit_id: active.id } : {}), test: false };
    if (navigator.onLine) {
      try {
        await apiRequest('/field/sos', { method: 'POST', body: JSON.stringify(payload) });
        setMessage(copy.messages.sosSent);
        return;
      } catch { /* Preserve the alert locally if the API is unavailable. */ }
    }
    await enqueueOperation({ id, kind: 'sos', ownerUserId: currentUserId, payload, createdAt: now.toISOString() });
    await refreshLocal();
    setSosSmsHref(buildSosSmsHref(buildSosSmsBody(now)));
    setMessage(copy.messages.sosQueued);
    if (locationDisclosureAccepted) void currentLocation().then((snapshot) => setSosSmsHref(buildSosSmsHref(buildSosSmsBody(now, snapshot)))).catch(() => undefined);
  }

  async function loadInbox() {
    if (import.meta.env.VITE_NURSE_INBOX_ENABLED !== 'true' || !navigator.onLine) return;
    try {
      const result = await apiRequest<{ items: Array<{ id: string; title: string; body: string; created_at?: string }> }>('/field/inbox');
      setInbox(result.items ?? []);
      setInboxMessage('');
    } catch { setInboxMessage(copy.messages.inboxUnavailable); }
  }

  const activeVisit = useMemo(() => visits.find((visit) => visit.status === 'in_progress'), [visits]);
  const safetyPromptVisit = useMemo(() => visits.find((visit) => visit.safety_state === 'armed' && (visit.status === 'in_progress' || visit.safety_checkout_pending)), [visits]);
  useHeartbeat(Boolean(token), activeVisit?.id);
  useEffect(() => { if (token) void checkForUpdate(); }, [token]);
  useEffect(() => { if (token && import.meta.env.VITE_NURSE_INBOX_ENABLED === 'true') void loadInbox(); }, [token]);

  const selectedVisit = (visitId: string) => visits.find((visit) => visit.id === visitId);
  const inboxEnabled = import.meta.env.VITE_NURSE_INBOX_ENABLED === 'true';
  const requiredPhotoMissing = Boolean(actionVisit?.photo_rules?.required_on_checkout && (actionVisit.photo_count ?? 0) === 0 && !localPhotos.some((photo) => photo.visitId === actionVisit?.id));
  const canAddRequiredPhoto = Boolean(photosEnabled && actionVisit?.photo_rules?.allowed);
  const views = {
    login: <LoginScreen identifier={identifier} password={password} busy={busy} online={online} onIdentifier={setIdentifier} onPassword={setPassword} onSubmit={signIn} />,
    today: <TodayScreen visits={visits} clients={clients} adhocAllowed={adhocAllowed} adhocOpen={adhocOpen} adhocClientId={adhocClientId} photosEnabled={photosEnabled} pendingPhotoCount={pendingPhotoCount} loading={busy} onAdhocOpen={() => setAdhocOpen((open) => !open)} onAdhocClient={setAdhocClientId} onStartAdhoc={startAdhocVisit} onSync={() => void sync()} onArrive={(visit) => requestVisitAction(visit, 'check_in')} onLeave={(visit) => requestVisitAction(visit, 'check_out')} onNote={openNote} onPhoto={openPhoto} />,
    onboarding: <Onboarding accepted={locationDisclosureAccepted} onAccept={acceptLocationDisclosure} onContinue={continueOnboarding} onEnableNotifications={() => void enableReminders()} showNotifications={Capacitor.isNativePlatform()} notificationsEnabled={visitRemindersEnabled} />,
    history: <HistoryScreen history={history} loading={historyLoading} hasMore={historyHasMore} onLoadMore={() => void loadMoreHistory()} />,
    profile: <ProfileScreen profile={fieldProfile} appVersion={APP_VERSION} versionInfo={versionInfo} remindersEnabled={visitRemindersEnabled} inboxEnabled={inboxEnabled} inbox={inbox} inboxMessage={inboxMessage} visits={visits} busy={busy} onSync={() => void sync()} onEnableReminders={() => void enableReminders()} onDisableReminders={() => void disableReminders()} onCheckUpdate={() => void checkForUpdate()} onLogout={() => void requestSignOut()} />,
    sync: <SyncScreen operations={allOperations} photos={localPhotos} userId={currentUserId} online={online} busy={busy} wifiOnly={wifiOnlyUpload} onSync={() => void sync()} onRetry={(id) => void retrySavedOperation(id)} onDiscard={(id) => void discardSavedOperation(id)} onApplyAgain={(operation) => void applySavedOperationAgain(operation)} onRetryPhoto={(id) => void retrySavedPhoto(id)} onUploadPhotoNow={(id) => { void uploadPhotoNow(id); }} onDiscardPhoto={(id) => void discardSavedPhoto(id)} />,
    visit: (visitId: string) => { const visit = selectedVisit(visitId); return visit ? <VisitDetail visit={visit} photosEnabled={photosEnabled} onArrive={(item) => requestVisitAction(item, 'check_in')} onLeave={(item) => requestVisitAction(item, 'check_out')} onNote={openNote} onPhoto={openPhoto} /> : <section className="panel"><h2>{copy.generic.visitUnavailable}</h2><p>{copy.generic.visitUnavailableCopy}</p><button type="button" onClick={() => void sync()}>{copy.generic.syncSchedule}</button></section>; },
    activeVisit: (visitId: string) => { const visit = selectedVisit(visitId); return visit && visit.status === 'in_progress' ? <ActiveVisit visit={visit} onNote={openNote} onPhoto={openPhoto} onLeave={(item) => requestVisitAction(item, 'check_out')} photosEnabled={photosEnabled} /> : <section className="panel"><h2>{copy.generic.activeVisitUnavailable}</h2><p>{copy.generic.activeVisitUnavailableCopy}</p><button type="button" onClick={() => void sync()}>{copy.generic.syncSchedule}</button></section>; },
  };
  const updateBlocked = Boolean(versionInfo && isForcedUpdate(APP_VERSION, versionInfo.min_supported));

  return <AppShell online={online} queued={queued} authenticated={Boolean(token)} message={message} sosEnabled={sosEnabled} smsHref={sosSmsHref} onSendSos={sendSos}>
    {token && updateBlocked && versionInfo ? <section className="panel update-gate"><UpdateNotice currentVersion={APP_VERSION} latestVersion={versionInfo.latest} minimumVersion={versionInfo.min_supported} downloadPath={versionInfo.download_path} /><button type="button" className="button-secondary" onClick={() => void checkForUpdate()}>{copy.update.checkAgain}</button></section> : token && consentsRequired.length > 0 ? <section className="panel consent-gate"><h2>{copy.consent.heading}</h2><p>{copy.consent.explanation}</p>{consentsRequired.map((requirement) => <article className="visit-card" key={`${requirement.type}:${requirement.version}`}><h3>{requirement.type.replaceAll('_', ' ')}</h3><p>{requirement.text}</p><p>{copy.consent.version} {requirement.version}</p><button type="button" onClick={() => void acceptConsent(requirement)}>{copy.consent.accept}</button></article>)}</section> : <NurseRoutes views={views} authenticated={Boolean(token)} />}
    {token && actionVisit && actionKind === 'check_in' && <ArriveSheet visit={actionVisit} location={actionLocation} locationState={actionLocationState} busy={actionBusy} safetyTimerEnabled={safetyTimerEnabled} canEnableSafetyTimer={sosEnabled} onSafetyTimerChange={setSafetyTimerEnabled} onConfirm={() => void confirmVisitAction()} onCancel={() => { setActionVisit(null); setActionKind(null); setSafetyTimerEnabled(false); }} />}
    {token && actionVisit && actionKind === 'check_out' && <LeaveSheet visit={actionVisit} finalNote={actionFinalNote} busy={actionBusy} onFinalNote={setActionFinalNote} onConfirm={() => void confirmVisitAction()} onCancel={() => { setActionVisit(null); setActionKind(null); }} onAddPhoto={() => { const visit = actionVisit; setActionVisit(null); setActionKind(null); if (visit) openPhoto(visit); }} canAddRequiredPhoto={canAddRequiredPhoto} requiredPhotoMissing={requiredPhotoMissing} />}
    {token && noteVisitId && selectedVisit(noteVisitId) && <NoteSheet visit={selectedVisit(noteVisitId)!} value={noteBody} onChange={setNoteBody} onSubmit={saveVisitNote} onCancel={() => { setNoteVisitId(''); setNoteBody(''); }} />}
    {token && photoVisitId && selectedVisit(photoVisitId) && <PhotoSheet visit={selectedVisit(photoVisitId)!} file={photoFile} onFile={setPhotoFile} onSubmit={savePhoto} onCancel={() => { setPhotoVisitId(''); setPhotoFile(null); }} pendingPhotos={localPhotos.filter((photo) => photo.visitId === photoVisitId)} pendingCount={pendingPhotoCount} wifiOnly={wifiOnlyUpload} onWifiOnly={(value) => { setWifiOnlyUpload(value); localStorage.setItem('nest.nurse.wifi-only-photos', String(value)); }} />}
    {token && <SafetyTimerPrompt visit={safetyPromptVisit} onOpenVisit={(visit) => navigate(`/active/${encodeURIComponent(visit.id)}`)} />}
    <LogoutGuard open={logoutGuardOpen} pendingItems={logoutPendingCount} onCancel={() => setLogoutGuardOpen(false)} onConfirm={() => { setLogoutGuardOpen(false); void signOut(); }} />
  </AppShell>;
}
