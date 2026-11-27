import { useRef, useState, type FormEvent } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import {
  cacheVisits,
  enqueueOperation,
  nurseDb,
  type CachedClient,
  type CachedVisit,
  type OutboxOperation,
} from '../../offline/db';
import { captureLocationWithStatus, type LocationSnapshot } from '../../platform/location';
import type { FieldProfile } from '../../app/useFieldProfile';
import { copy } from '../../copy';

type VisitActionKind = 'check_in' | 'check_out';
type PendingVisitAction = { visit: CachedVisit; kind: VisitActionKind };

type UseNurseVisitWorkflowOptions = {
  visits: CachedVisit[];
  clients: CachedClient[];
  currentUserId: string;
  fieldProfile: FieldProfile | null;
  locationDisclosureAccepted: boolean;
  setLocationDisclosureAccepted: (accepted: boolean) => void;
  arriveBlocked: (clientId?: string | null) => boolean;
  refreshLocal: () => Promise<void>;
  sync: () => Promise<void>;
  navigate: NavigateFunction;
  setMessage: (message: string) => void;
  createId: () => string;
};

/** Owns the offline-first visit creation, notes, arrival/departure and location-consent workflow. */
export function useNurseVisitWorkflow({
  visits,
  clients,
  currentUserId,
  fieldProfile,
  locationDisclosureAccepted,
  setLocationDisclosureAccepted,
  arriveBlocked,
  refreshLocal,
  sync,
  navigate,
  setMessage,
  createId,
}: UseNurseVisitWorkflowOptions) {
  const [pendingAdhocStart, setPendingAdhocStart] = useState(false);
  const [adhocOpen, setAdhocOpen] = useState(false);
  const [adhocClientId, setAdhocClientId] = useState('');
  const [noteVisitId, setNoteVisitId] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [actionVisit, setActionVisit] = useState<CachedVisit | null>(null);
  const [actionKind, setActionKind] = useState<VisitActionKind | null>(null);
  const [actionLocation, setActionLocation] = useState<LocationSnapshot | null>(null);
  const [actionLocationState, setActionLocationState] = useState<'acquiring' | 'good' | 'low_accuracy' | 'denied' | 'unavailable'>('acquiring');
  const [actionBusy, setActionBusy] = useState(false);
  const [safetyTimerEnabled, setSafetyTimerEnabled] = useState(false);
  const [actionFinalNote, setActionFinalNote] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingVisitAction | null>(null);
  const actionBusyRef = useRef(false);

  async function createAdhocVisit() {
    const client = clients.find((item) => item.id === adhocClientId);
    if (!client) {
      navigate('/');
      return;
    }
    const now = new Date().toISOString();
    const id = createId();
    const location = await captureLocationWithStatus();
    const payload = {
      id,
      client_op_id: id,
      client_id: client.id,
      device_time: now,
      sent_at_device: now,
      ...location.snapshot,
      source: Capacitor.isNativePlatform() ? 'app_manual' : 'pwa_manual',
      device_info: { user_agent: navigator.userAgent },
    };
    const photoRequired = client.photo_required ?? fieldProfile?.settings?.photo_required ?? 'none';
    const localVisit: Omit<CachedVisit, 'updatedAt'> = {
      id,
      client_display_name: client.display_name,
      place_address_text: '',
      scheduled_start: now,
      scheduled_end: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      status: 'in_progress',
      instructions: '',
      adhoc: true,
      check_in_at: now,
      check_out_at: null,
      verification_label: 'pending_sync',
      safety_state: 'off',
      photo_types: [],
      photo_rules: {
        allowed: Boolean(client.photo_allowed),
        required_mode: photoRequired,
        required_on_checkout: photoRequired !== 'none',
        guidance_text: client.photo_guidance_text != null
          ? client.photo_guidance_text
          : fieldProfile?.settings?.photo_guidance_text ?? null,
      },
    };
    await cacheVisits([...visits.filter((visit) => visit.id !== id), localVisit]);
    await enqueueOperation({ id, kind: 'visit_create_adhoc', ownerUserId: currentUserId, payload, createdAt: now });
    setAdhocOpen(false);
    setAdhocClientId('');
    await refreshLocal();
    setMessage(copy.messages.adhocSaved);
    navigate('/');
    if (navigator.onLine) void sync();
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

  async function saveVisitNote(event: FormEvent) {
    event.preventDefault();
    const visitId = noteVisitId;
    const body = noteBody.trim();
    if (!visitId || !body) return;
    const now = new Date().toISOString();
    const id = createId();
    await enqueueOperation({
      id,
      kind: 'visit_note',
      visitId,
      ownerUserId: currentUserId,
      payload: { id, client_op_id: id, body, created_at_device: now, geo_snap: {} },
      createdAt: now,
    });
    setNoteBody('');
    setNoteVisitId('');
    await refreshLocal();
    setMessage(copy.messages.noteSaved);
    if (navigator.onLine) void sync();
  }

  async function visitAction(
    visit: CachedVisit,
    kind: VisitActionKind,
    locationOverride?: LocationSnapshot | null,
    safetyTimerMinutes?: number,
    finalNote = '',
  ) {
    const snapshot = locationOverride ?? { lat: null, lng: null, accuracy_m: 0 };
    const now = new Date().toISOString();
    const id = createId();
    const payload = {
      id,
      client_op_id: id,
      device_time: now,
      sent_at_device: now,
      ...snapshot,
      source: Capacitor.isNativePlatform() ? 'app_manual' : 'pwa_manual',
      device_info: { user_agent: navigator.userAgent },
      ...(kind === 'check_in' && safetyTimerMinutes ? { safety_timer_minutes: safetyTimerMinutes } : {}),
    };
    const safetyTimerUntil = kind === 'check_in' && safetyTimerMinutes
      ? new Date(Date.parse(visit.scheduled_end) + safetyTimerMinutes * 60_000).toISOString()
      : undefined;
    const operations: OutboxOperation[] = [{
      id,
      kind,
      visitId: visit.id,
      ownerUserId: currentUserId,
      payload,
      createdAt: now,
      state: 'queued',
      attempts: 0,
    }];
    if (kind === 'check_out' && finalNote.trim()) {
      const noteId = createId();
      operations.push({
        id: noteId,
        kind: 'visit_note',
        visitId: visit.id,
        ownerUserId: currentUserId,
        payload: { id: noteId, client_op_id: noteId, body: finalNote.trim(), created_at_device: now, geo_snap: {} },
        createdAt: now,
        state: 'queued',
        attempts: 0,
      });
    }
    const visitPatch: Partial<CachedVisit> = kind === 'check_in'
      ? {
          status: 'in_progress',
          check_in_at: now,
          safety_checkout_pending: false,
          ...(safetyTimerUntil
            ? { safety_timer_until: safetyTimerUntil, safety_state: 'armed', safety_timer_sync_state: 'pending_sync' as const }
            : {}),
        }
      : {
          status: 'completed',
          check_out_at: now,
          safety_checkout_pending: visit.safety_state === 'armed',
          // Keep the local safety state until the server confirms the checkout on a later pull.
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

  function openActionSheet(visit: CachedVisit, kind: VisitActionKind) {
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

  function requestVisitAction(visit: CachedVisit, kind: VisitActionKind) {
    if (kind === 'check_in' && arriveBlocked(visit.client_id)) {
      setMessage('Form 03 (consent to care) must be signed before you can arrive. Open Care forms on this visit.');
      return;
    }
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
      await visitAction(
        actionVisit,
        actionKind,
        actionLocation ?? { lat: null, lng: null, accuracy_m: 0 },
        timerMinutes,
        actionKind === 'check_out' ? actionFinalNote : '',
      );
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

  function openNote(visit: CachedVisit) {
    setNoteVisitId(visit.id);
    setNoteBody('');
  }

  return {
    pendingAdhocStart,
    setPendingAdhocStart,
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
    pendingAction,
    setPendingAction,
    startAdhocVisit,
    createAdhocVisit,
    saveVisitNote,
    visitAction,
    openActionSheet,
    requestVisitAction,
    acceptLocationDisclosure,
    continueOnboarding,
    confirmVisitAction,
    openNote,
  };
}
