import { Capacitor } from '@capacitor/core';
import { apiRequest } from '../../lib/api/client';
import { VisitTracker } from '../../plugins/VisitTracker';
import { clearQueue, enqueue, flushQueue, toPayload } from './trackQueue';

/**
 * On sign-out: take the last samples from the phone, stop the stopwatch notification, send what is waiting
 * while the session is still valid, then remove the rest from this device so the next person cannot see it.
 */
export async function finishVisitTracking(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      const status = await VisitTracker.status().catch(() => null);
      const { points } = await VisitTracker.drain().catch(() => ({ points: [] }));
      if (status?.visitId) enqueue(status.visitId, points.map((sample) => toPayload(status.visitId, status.startedAt || sample.at, sample, true)));
      await VisitTracker.stop().catch(() => undefined);
    }
    if (navigator.onLine && sessionStorage.getItem('nurse_access_token')) {
      await flushQueue((visitId, pts) => apiRequest(`/field/visits/${encodeURIComponent(visitId)}/track`, { method: 'POST', body: JSON.stringify({ points: pts }) }).then(() => undefined)).catch(() => undefined);
    }
  } finally {
    clearQueue();
  }
}
