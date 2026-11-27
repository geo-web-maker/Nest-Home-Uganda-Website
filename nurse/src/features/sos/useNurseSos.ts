import { useCallback } from 'react';
import { apiRequest } from '../../lib/api/client';
import { enqueueOperation, type CachedVisit } from '../../offline/db';
import { captureLocation, type LocationSnapshot } from '../../platform/location';
import { buildSosSmsBody, buildSosSmsHref } from './sosMessage';
import type { FieldProfile } from '../../app/useFieldProfile';
import type { LiveFollowStartResult, SosSendResult } from './SosSheet';
import { copy } from '../../copy';

export type NurseSosOptions = {
  currentUserId: string;
  visits: CachedVisit[];
  fieldProfile: FieldProfile | null;
  locationDisclosureAccepted: boolean;
  refreshLocal: () => Promise<void>;
  setMessage: (message: string) => void;
  setSosSmsHref: (href: string) => void;
  createId: () => string;
};

/** Keeps emergency dispatch, queued fallback, live-follow and safe-now API calls together. */
export function useNurseSos({
  currentUserId,
  visits,
  fieldProfile,
  locationDisclosureAccepted,
  refreshLocal,
  setMessage,
  setSosSmsHref,
  createId,
}: NurseSosOptions) {
  const sendSos = useCallback(async (): Promise<SosSendResult> => {
    const now = new Date();
    const id = createId();
    const active = visits.find((visit) => visit.status === 'in_progress');
    const payload = { id, ...(active ? { visit_id: active.id } : {}), test: false };
    if (navigator.onLine) {
      try {
        const response = await apiRequest<{ id: string; status: string }>('/field/sos', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setMessage(copy.messages.sosSent);
        return { caseId: response.id, serverConfirmed: true };
      } catch {
        // Preserve the alert locally when the API cannot be reached.
      }
    }
    await enqueueOperation({ id, kind: 'sos', ownerUserId: currentUserId, payload, createdAt: now.toISOString() });
    await refreshLocal();
    setSosSmsHref(buildSosSmsHref(buildSosSmsBody(now)));
    setMessage(copy.messages.sosQueued);
    if (locationDisclosureAccepted) {
      void captureLocation()
        .then((snapshot) => setSosSmsHref(buildSosSmsHref(buildSosSmsBody(now, snapshot))))
        .catch(() => undefined);
    }
    return { caseId: null, serverConfirmed: false };
  }, [createId, visits, setMessage, currentUserId, refreshLocal, setSosSmsHref, locationDisclosureAccepted]);

  const startSosFollow = useCallback(async (caseId: string): Promise<LiveFollowStartResult> => {
    if (!navigator.onLine) throw new Error('Live follow requires a connection.');
    const response = await apiRequest<{ until: string; active: boolean; interval_seconds?: number }>(
      `/field/sos/${encodeURIComponent(caseId)}/follow/start`,
      { method: 'POST', body: JSON.stringify({ id: createId() }) },
    );
    if (!response.active || !response.until) throw new Error('Server did not activate live follow.');
    return {
      until: response.until,
      intervalSeconds: response.interval_seconds ?? fieldProfile?.settings?.live_follow_interval_seconds ?? 30,
    };
  }, [createId, fieldProfile]);

  const pingSosFollow = useCallback(async (caseId: string, snapshot: LocationSnapshot, capturedAt: string) => {
    if (!navigator.onLine || snapshot.lat === null || snapshot.lng === null) {
      throw new Error('A location update is unavailable.');
    }
    await apiRequest(`/field/sos/${encodeURIComponent(caseId)}/follow/ping`, {
      method: 'POST',
      body: JSON.stringify({
        id: createId(),
        lat: snapshot.lat,
        lng: snapshot.lng,
        accuracy_m: snapshot.accuracy_m,
        captured_at: capturedAt,
      }),
    });
  }, [createId]);

  const reportSafeNow = useCallback(async (caseId: string) => {
    if (!navigator.onLine) throw new Error('Reconnect before confirming the safe update.');
    const response = await apiRequest<{ confirmed: boolean }>(
      `/field/sos/${encodeURIComponent(caseId)}/safe`,
      { method: 'POST', body: JSON.stringify({ id: createId() }) },
    );
    if (!response.confirmed) throw new Error('Safe update was not confirmed.');
    setMessage(copy.safety.liveFollowStopped);
  }, [createId, setMessage]);

  return { sendSos, startSosFollow, pingSosFollow, reportSafeNow };
}
