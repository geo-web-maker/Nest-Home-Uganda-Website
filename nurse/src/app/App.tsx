import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { apiRequest } from '../lib/api/client';
import { useNurseHistory } from '../features/history/useNurseHistory';
import { useNursePhotoWorkflow } from '../features/photos/useNursePhotoWorkflow';
import { LogoutGuard } from './LogoutGuard';
import { needsLogoutConfirmation } from './logoutGuard';
import { readRefreshToken } from '../platform/secureTokenStorage';
import { clearMailCache } from '../features/mail/mailStore';
import {
  clearSyncCursor,
  enqueueOperation,
  nurseDb,
  updateLocalPhoto,
  type CachedClient,
  type CachedVisit,
  type LocalPhoto,
  type OutboxOperation,
} from '../offline/db';
import { buildSosSmsBody, buildSosSmsHref } from '../features/sos/sosMessage';
import { checkoutPhotoRequirementMissing } from '../features/photos/requirements';
import { useSession } from './useSession';
import { useToast } from './useToast';
import {
  forgetCachedProfile,
  useFieldProfile,
  type FieldConsentRequirement,
  type FieldProfile,
} from './useFieldProfile';
import { clearPdfCache } from '../features/careforms/pdfCache';
import { useHeartbeat } from '../features/heartbeat/useHeartbeat';
import { useVisitTracker } from '../features/tracking/useVisitTracker';
import { finishVisitTracking } from '../features/tracking/finishTracking';
import { copy } from '../copy';
import { AppShell } from './AppShell';
import { NurseRoutes } from './routes';
import { createVisitRouteViews } from './visitRouteViews';
import { NurseAccessGate } from './NurseAccessGate';
import { VisitActionSheets } from './VisitActionSheets';
import { createPrimaryRouteViews } from './primaryRouteViews';
import { PasswordChangeRequiredError } from './useSession';
import { SafetyTimerPrompt } from '../screens/SafetyTimerPrompt';
import { CareFormsProvider, useCareForms } from '../features/careforms/useCareForms';
import { SsoRelay } from './SsoRelay';
import { fetchAppAccess, startPull } from '../platform/appSwitch';
import { isNativeAppSwitchAvailable, requestOtherAppHandoff } from '../platform/nativeAppSwitch';
import { ADMIN_NATIVE_APP_ID } from '../platform/identity';
import { useNurseOfflineSync } from '../features/offline/useNurseOfflineSync';
import { useNurseOutboxActions } from '../features/offline/useNurseOutboxActions';
import { useNativeSessionRestore } from '../features/authentication/useNativeSessionRestore';
import { useNurseSos } from '../features/sos/useNurseSos';
import { useNurseAppVersion } from '../features/update/useNurseAppVersion';
import { useNurseVisitWorkflow } from '../features/visits/useNurseVisitWorkflow';
import { useNurseNotifications } from '../features/notifications/useNurseNotifications';
import { safeNurseNotificationPath } from '../features/notifications/safeNotificationPath';
import { useNurseNativeHandoff } from '../features/authentication/useNurseNativeHandoff';

type ConsentRequirement = FieldConsentRequirement;
function makeId() { return globalThis.crypto?.randomUUID?.() ?? `op-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function loginFailureMessage(error: unknown): string {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : -1;
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';

  if (status === 0) return copy.login.offlineServer;
  if (status === 401) return copy.login.invalidCredentials;
  if (code === 'nurse_profile_inactive') return copy.login.nurseProfileInactive;
  if (status === 403 || status === 404) return copy.login.notNurse;
  if (status === 429) return copy.login.tooManyAttempts;
  if (status >= 500) return copy.login.serverError;
  return copy.login.failed;
}
export function App() { return <BrowserRouter><NurseWorkspace /></BrowserRouter>; }

function NurseWorkspace() {
  const navigate = useNavigate();
  const session = useSession();
  const { profile: fieldProfile, setProfile: setFieldProfile, loadProfile, clearProfile, accessProblem } = useFieldProfile();
  const [online, setOnline] = useState(navigator.onLine);
  const [visitRemindersEnabled, setVisitRemindersEnabled] = useState(localStorage.getItem('nest.nurse.visit-reminders') === 'true');
  const [visits, setVisits] = useState<CachedVisit[]>([]);
  const [queued, setQueued] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useToast(6_000);
  const token = session.token;
  const historyWorkflow = useNurseHistory(online, setMessage, copy.messages.historyUnavailable);
  const { history, setHistory, setPage: setHistoryPage, hasMore: historyHasMore, setHasMore: setHistoryHasMore, loading: historyLoading, loadMore: loadMoreHistory } = historyWorkflow;
  /** Signed in either with a live access token or, on a cold start without a network, on the strength of the stored refresh token. */
  const signedIn = Boolean(token) || session.offlineTrusted;
  const setToken = session.setToken;
  const {
    versionInfo,
    preLoginBlocked,
    preLoginMinimum,
    appVersion,
    updateBlocked,
    checkForUpdate,
  } = useNurseAppVersion({ token, signedIn, setMessage });
  const [currentUserId, setCurrentUserId] = useState('');
  const [consentsRequired, setConsentsRequired] = useState<ConsentRequirement[]>([]);
  const [allOperations, setAllOperations] = useState<OutboxOperation[]>([]);
  const [localPhotos, setLocalPhotos] = useState<LocalPhoto[]>([]);
  const [wifiOnlyUpload, setWifiOnlyUpload] = useState(localStorage.getItem('nest.nurse.wifi-only-photos') === 'true');
  const [locationDisclosureAccepted, setLocationDisclosureAccepted] = useState(localStorage.getItem('nest.nurse.location-disclosure') === 'true');
  const [inbox, setInbox] = useState<Array<{ id: string; title: string; body: string; created_at?: string }>>([]);
  const [inboxMessage, setInboxMessage] = useState('');
  const [sosSmsHref, setSosSmsHref] = useState(() => buildSosSmsHref(buildSosSmsBody()));
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [clients, setClients] = useState<CachedClient[]>([]);
  const [adhocAllowed, setAdhocAllowed] = useState(false);
  const [photosEnabled, setPhotosEnabled] = useState(localStorage.getItem('nest.nurse.photos-enabled') === 'true');
  const [sosEnabled, setSosEnabled] = useState(false);
  const [pendingPhotoCount, setPendingPhotoCount] = useState(0);
  const [logoutGuardOpen, setLogoutGuardOpen] = useState(false);
  const [logoutPendingCount, setLogoutPendingCount] = useState(0);
  const refreshLocalRef = useRef<() => Promise<void>>(async () => undefined);
  const syncRef = useRef<() => Promise<void>>(async () => undefined);
  const careForms = useCareForms({ userId: currentUserId, token, online, onQueued: () => { void refreshLocalRef.current(); void syncRef.current(); } });
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
  const offlineSync = useNurseOfflineSync({
    token,
    wifiOnlyUpload,
    applyProfile,
    loadProfile,
    refreshCareForms: careForms.refresh,
    setOnline,
    setVisits,
    setHistory,
    setClients,
    setAllOperations,
    setLocalPhotos,
    setPendingPhotoCount,
    setQueued,
    setBusy,
    setHistoryPage,
    setHistoryHasMore,
    setMessage,
  });
  const { refreshLocal, sync, syncInFlight, manualPhotoUploadOverride } = offlineSync;
  const { sendSos, startSosFollow, pingSosFollow, reportSafeNow } = useNurseSos({
    currentUserId,
    visits,
    fieldProfile,
    locationDisclosureAccepted,
    refreshLocal,
    setMessage,
    setSosSmsHref,
    createId: makeId,
  });
  const photoWorkflow = useNursePhotoWorkflow({
    visits,
    currentUserId,
    photosEnabled,
    pendingPhotoCount,
    refreshLocal,
    sync,
    setMessage,
    messages: copy.photos,
    createId: makeId,
  });
  const {
    photoVisitId, photoFile, serverPhotos, serverPhotosLoading,
    setPhotoVisitId, setPhotoFile, savePhoto, openPhoto, closePhoto,
  } = photoWorkflow;
  const visitWorkflow = useNurseVisitWorkflow({
    visits,
    clients,
    currentUserId,
    fieldProfile,
    locationDisclosureAccepted,
    setLocationDisclosureAccepted,
    arriveBlocked: careForms.arriveBlocked,
    refreshLocal,
    sync,
    navigate,
    setMessage,
    createId: makeId,
  });
  const {
    adhocOpen,
    setAdhocOpen,
    adhocClientId,
    setAdhocClientId,
    noteVisitId,
    setNoteVisitId,
    noteBody,
    setNoteBody,
    actionVisit,
    setActionVisit,
    actionKind,
    setActionKind,
    actionLocation,
    actionLocationState,
    actionBusy,
    safetyTimerEnabled,
    setSafetyTimerEnabled,
    actionFinalNote,
    setActionFinalNote,
    startAdhocVisit,
    saveVisitNote,
    requestVisitAction,
    acceptLocationDisclosure,
    continueOnboarding,
    confirmVisitAction,
    openNote,
  } = visitWorkflow;
  const notifications = useNurseNotifications({
    currentUserId,
    token,
    visits,
    visitRemindersEnabled,
    setVisitRemindersEnabled,
    sync,
    navigate,
    setMessage,
    setInbox,
    setInboxMessage,
  });
  const { registerPushIfOptedIn, stopPushRegistration, enableReminders, disableReminders, clearScheduledReminders } = notifications;
  const { bootChecked } = useNativeSessionRestore({
    offlineTrusted: session.offlineTrusted,
    setToken,
    setOfflineTrusted: session.setOfflineTrusted,
    applyProfile,
    refreshLocal,
    setMessage,
  });
  useEffect(() => {
    const notice = sessionStorage.getItem('nhc.handoff.notice');
    if (notice) {
      setMessage(notice);
      sessionStorage.removeItem('nhc.handoff.notice');
    }
  }, [setMessage]);
  useEffect(() => {
    // Establish the non-sensitive dual-access hint after session restore/sign-in so the
    // login screen can offer the optional PKCE pull flow on the next visit.
    if (!signedIn || !navigator.onLine) return;
    void fetchAppAccess(<T,>(path: string) => apiRequest<T>(path)).catch(() => undefined);
  }, [signedIn]);
  useEffect(() => {
    // Persistence is a best-effort enhancement. The app still handles storage denial gracefully.
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
  }, []);
  const completeSignIn = useCallback(async () => {
    // Keep password and cross-app sign-in on the same profile hydration, push and sync path.
    const profile = await loadProfile();
    await applyProfile(profile);
    if (visitRemindersEnabled) void registerPushIfOptedIn(profile.user_id);
    setMessage(copy.messages.signedIn);
    if ((profile.consents_required ?? []).length === 0) await sync();
  }, [loadProfile, applyProfile, visitRemindersEnabled, registerPushIfOptedIn, setMessage, sync]);

  useNurseNativeHandoff({
    completeSignIn,
    clearProfile,
    setLoginError,
    setMessage,
    setToken,
    setOfflineTrusted: session.setOfflineTrusted,
    signOutLocal: session.signOutLocal,
  });

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(copy.messages.signInProgress);
    try {
      await session.signIn(identifier, password);
      setPassword('');
      setLoginError('');
      await completeSignIn();
    } catch (error: unknown) {
      if (error instanceof PasswordChangeRequiredError) {
        // Temporary password accepted: choose a real one before signing in.
        setPassword('');
        setLoginError('');
        setMessage('');
        navigate(`/set-password?token=${encodeURIComponent(error.token)}&purpose=${error.purpose}&from=temp`, { replace: true });
        return;
      }
      setLoginError(loginFailureMessage(error));
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
    try { await stopPushRegistration(); } catch { /* Local sign-out must still complete. */ }
    try { await finishVisitTracking(); } catch { /* Local sign-out must still complete. */ }
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
    try { await clearScheduledReminders(); } catch { /* Local sign-out must still complete. */ }
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
    await nurseDb.visits.clear();
    await nurseDb.history.clear();
    await nurseDb.clients.clear();
    await nurseDb.consents.clear();
    await clearMailCache();
    await forgetCachedProfile(currentUserId);
    await clearPdfCache();
    localStorage.removeItem('nest.nurse.cache-user-id');
    setCurrentUserId('');
    setConsentsRequired([]);
    setAdhocAllowed(false);
    setPhotosEnabled(false);
    setSosEnabled(false);
    setAdhocOpen(false);
    closePhoto();
    setNoteVisitId('');
    setActionVisit(null);
    setActionKind(null);
    setSafetyTimerEnabled(false);
    setLogoutGuardOpen(false);
    setLogoutPendingCount(0);
    setAllOperations([]);
    setLocalPhotos([]);
    setQueued(0);
    setPendingPhotoCount(0);
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
  const outboxActions = useNurseOutboxActions({
    visits,
    currentUserId,
    createId: makeId,
    refreshLocal,
    sync,
    syncInFlight,
    setMessage,
    setPhotoFile,
    setPhotoVisitId,
    openPhoto,
  });
  const {
    retrySavedOperation,
    applySavedOperationAgain,
    discardSavedOperation,
    retrySavedPhoto,
    discardSavedPhoto,
    retakeSavedPhoto,
  } = outboxActions;

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


  const activeVisit = useMemo(() => visits.find((visit) => visit.status === 'in_progress'), [visits]);
  const pendingHistoryVisitIds = useMemo(() => {
    const pending = allOperations.filter((operation) =>
      operation.ownerUserId === currentUserId
      && operation.visitId
      && ['queued', 'sending', 'needs_attention'].includes(operation.state),
    );
    return [...new Set(pending.map((operation) => operation.visitId!).filter(Boolean))];
  }, [allOperations, currentUserId]);
  const safetyPromptVisit = useMemo(() => visits.find((visit) => visit.safety_state === 'armed' && (visit.status === 'in_progress' || visit.safety_checkout_pending)), [visits]);
  useHeartbeat(Boolean(token), activeVisit?.id);
  useVisitTracker(
    Boolean(token),
    activeVisit ? { id: activeVisit.id, startedAt: activeVisit.check_in_at } : undefined,
    (path) => {
      const target = safeNurseNotificationPath(path);
      if (target) navigate(target);
    },
  );

  const selectedVisit = (visitId: string) => visits.find((visit) => visit.id === visitId);
  const inboxEnabled = import.meta.env.VITE_NURSE_INBOX_ENABLED === 'true';
  const requiredPhotoMode = actionVisit?.photo_rules?.required_mode ?? (actionVisit?.photo_rules?.required_on_checkout ? 'departure' : 'none');
  const checkoutPhotoTypes = [
    ...((actionVisit?.photo_types ?? []).filter((value): value is 'arrival' | 'departure' | 'other' => value === 'arrival' || value === 'departure' || value === 'other')),
    ...localPhotos.filter((photo) => photo.visitId === actionVisit?.id).map((photo) => photo.photoType ?? 'other'),
  ];
  const requiredPhotoMissing = Boolean(actionVisit && checkoutPhotoRequirementMissing(requiredPhotoMode, checkoutPhotoTypes));
  const canAddRequiredPhoto = Boolean(photosEnabled && actionVisit?.photo_rules?.allowed);
  const visitRouteViews = createVisitRouteViews({
    selectedVisit,
    photosEnabled,
    onArrive: (visit) => requestVisitAction(visit, 'check_in'),
    onLeave: (visit) => requestVisitAction(visit, 'check_out'),
    onNote: openNote,
    onPhoto: openPhoto,
    onSync: () => void sync(),
  });

  const views = {
    ...createPrimaryRouteViews({
      login: {
        identifier,
        password,
        busy,
        online,
        errorMessage: loginError,
        showContinueWithAdmin: localStorage.getItem('nhc.dual_access') === '1' || import.meta.env.VITE_SHOW_PULL_SSO === 'true',
        onContinueWithAdmin: () => {
          void startPull(
            'admin',
            'nurse',
            import.meta.env.VITE_ADMIN_APP_URL as string | undefined,
            isNativeAppSwitchAvailable()
              ? {
                packageName: (import.meta.env.VITE_ADMIN_ANDROID_PACKAGE as string | undefined) || ADMIN_NATIVE_APP_ID,
                request: requestOtherAppHandoff,
              }
              : undefined,
          ).catch(() => setLoginError(copy.appSwitch.unavailable));
        },
        onIdentifier: (value) => { setIdentifier(value); setLoginError(''); },
        onPassword: (value) => { setPassword(value); setLoginError(''); },
        onSubmit: signIn,
      },
      today: {
        visits,
        clients,
        adhocAllowed,
        adhocOpen,
        adhocClientId,
        photosEnabled,
        pendingPhotoCount,
        loading: busy,
        displayName: fieldProfile?.display_name,
        staffNumber: fieldProfile?.staff_number,
        onAdhocOpen: () => setAdhocOpen((open) => !open),
        onAdhocClient: setAdhocClientId,
        onStartAdhoc: startAdhocVisit,
        onSync: () => void sync(),
        onArrive: (visit) => requestVisitAction(visit, 'check_in'),
        onLeave: (visit) => requestVisitAction(visit, 'check_out'),
        onNote: openNote,
        onPhoto: openPhoto,
      },
      onboarding: {
        accepted: locationDisclosureAccepted,
        onAccept: acceptLocationDisclosure,
        onContinue: continueOnboarding,
        onEnableNotifications: () => void enableReminders(),
        showNotifications: Capacitor.isNativePlatform(),
        notificationsEnabled: visitRemindersEnabled,
      },
      history: {
        history,
        loading: historyLoading,
        hasMore: historyHasMore,
        onLoadMore: () => void loadMoreHistory(),
        pendingVisitIds: pendingHistoryVisitIds,
      },
      timesheets: { online },
      profile: {
        sosEnabled,
        profile: fieldProfile,
        appVersion,
        versionInfo,
        remindersEnabled: visitRemindersEnabled,
        inboxEnabled,
        inbox,
        inboxMessage,
        visits,
        busy,
        onSync: () => void sync(),
        onEnableReminders: () => void enableReminders(),
        onDisableReminders: () => void disableReminders(),
        onCheckUpdate: () => void checkForUpdate(),
        onLogout: () => void requestSignOut(),
      },
      sync: {
        operations: allOperations,
        photos: localPhotos,
        userId: currentUserId,
        online,
        busy,
        wifiOnly: wifiOnlyUpload,
        onSync: () => void sync(),
        onRetry: (id) => void retrySavedOperation(id),
        onDiscard: (id) => void discardSavedOperation(id),
        onApplyAgain: (operation) => void applySavedOperationAgain(operation),
        onRetryPhoto: (id) => void retrySavedPhoto(id),
        onUploadPhotoNow: (id) => { void uploadPhotoNow(id); },
        onDiscardPhoto: (id) => void discardSavedPhoto(id),
      },
    }),
    ...visitRouteViews,
  };

  refreshLocalRef.current = refreshLocal;
  syncRef.current = sync;
  if (window.location.pathname === '/sso') return <SsoRelay ready={bootChecked} signedIn={signedIn} />;
  return (
    <CareFormsProvider value={careForms}>
      <AppShell
        onDismissMessage={() => setMessage('')}
        online={online}
        queued={queued}
        authenticated={signedIn}
        message={message}
        syncing={busy}
        sosEnabled={sosEnabled}
        smsHref={sosSmsHref}
        emergencyNumbers={fieldProfile?.settings?.emergency_numbers ?? []}
        supervisorPhone={fieldProfile?.supervisor_phone}
        liveFollowEnabled={Boolean(fieldProfile?.settings?.live_follow_enabled)}
        liveFollowMinutes={fieldProfile?.settings?.live_follow_minutes ?? 30}
        liveFollowIntervalSeconds={fieldProfile?.settings?.live_follow_interval_seconds ?? 30}
        sosHoldSeconds={fieldProfile?.settings?.sos_hold_seconds ?? 2}
        sosCancelWindowSeconds={fieldProfile?.settings?.sos_cancel_window_s ?? 5}
        onSendSos={sendSos}
        onStartSosFollow={startSosFollow}
        onPingSosFollow={pingSosFollow}
        onSafeNow={reportSafeNow}
      >
    <NurseAccessGate
      bootChecked={bootChecked}
      signedIn={signedIn}
      preLoginBlocked={preLoginBlocked}
      preLoginMinimum={preLoginMinimum}
      updateBlocked={updateBlocked}
      versionInfo={versionInfo}
      appVersion={appVersion}
      accessProblem={accessProblem}
      consentsRequired={consentsRequired}
      onCheckAgain={() => void checkForUpdate()}
      onSignOut={() => void requestSignOut()}
      onAcceptConsent={(requirement) => void acceptConsent(requirement)}
    >
      <NurseRoutes views={views} authenticated={signedIn} />
    </NurseAccessGate>
    <VisitActionSheets
      authenticated={signedIn}
      actionVisit={actionVisit}
      actionKind={actionKind}
      actionLocation={actionLocation}
      actionLocationState={actionLocationState}
      actionBusy={actionBusy}
      safetyTimerEnabled={safetyTimerEnabled}
      sosEnabled={sosEnabled}
      finalNote={actionFinalNote}
      canAddRequiredPhoto={canAddRequiredPhoto}
      requiredPhotoMissing={requiredPhotoMissing}
      noteVisit={selectedVisit(noteVisitId)}
      noteBody={noteBody}
      photoVisit={selectedVisit(photoVisitId)}
      photoFile={photoFile}
      localPhotos={localPhotos}
      pendingPhotoCount={pendingPhotoCount}
      serverPhotos={serverPhotos}
      serverPhotosLoading={serverPhotosLoading}
      photosEnabled={photosEnabled}
      photoGuidanceText={selectedVisit(photoVisitId)?.photo_rules?.guidance_text != null
        ? selectedVisit(photoVisitId)?.photo_rules?.guidance_text?.trim() ?? ''
        : fieldProfile?.settings?.photo_guidance_text || ''}
      wifiOnly={wifiOnlyUpload}
      busy={busy}
      onSafetyTimerChange={setSafetyTimerEnabled}
      onConfirmAction={() => void confirmVisitAction()}
      onCancelArrive={() => { setActionVisit(null); setActionKind(null); setSafetyTimerEnabled(false); }}
      onFinalNoteChange={setActionFinalNote}
      onCancelLeave={() => { setActionVisit(null); setActionKind(null); }}
      onAddPhoto={() => {
        const visit = actionVisit;
        setActionVisit(null);
        setActionKind(null);
        if (visit) openPhoto(visit);
      }}
      onNoteChange={setNoteBody}
      onSaveNote={saveVisitNote}
      onCancelNote={() => { setNoteVisitId(''); setNoteBody(''); }}
      onPhotoFile={setPhotoFile}
      onSavePhoto={savePhoto}
      onDiscardLocalPhoto={(id) => void discardSavedPhoto(id)}
      onRetakeLocalPhoto={(id) => void retakeSavedPhoto(id)}
      onCancelPhoto={closePhoto}
      onWifiOnlyChange={(value) => {
        setWifiOnlyUpload(value);
        localStorage.setItem('nest.nurse.wifi-only-photos', String(value));
      }}
    />
        {signedIn && (
          <SafetyTimerPrompt
            visit={safetyPromptVisit}
            onOpenVisit={(visit) => navigate(`/active/${encodeURIComponent(visit.id)}`)}
          />
        )}
        <LogoutGuard
          open={logoutGuardOpen}
          pendingItems={logoutPendingCount}
          onCancel={() => setLogoutGuardOpen(false)}
          onConfirm={() => {
            setLogoutGuardOpen(false);
            void signOut();
          }}
        />
      </AppShell>
    </CareFormsProvider>
  );
}
