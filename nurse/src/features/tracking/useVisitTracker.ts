import { useEffect, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { apiRequest } from '../../lib/api/client';
import { captureLocationWithStatus } from '../../platform/location';
import { VisitTracker } from '../../plugins/VisitTracker';
import { enqueue, flushQueue, toPayload } from './trackQueue';

const SAMPLE_MS = 120_000;
const UPLOAD_MS = 60_000;

const sendPoints = (visitId: string, points: unknown[]) =>
  apiRequest(`/field/visits/${encodeURIComponent(visitId)}/track`, { method: 'POST', body: JSON.stringify({ points }) }).then(() => undefined);

/**
 * Work-time stopwatch and location audit. While a visit is in progress, the Android app shows an ongoing
 * notification with a live stopwatch and records the nurse's location every couple of minutes, even with the app
 * closed. Samples are uploaded when the phone is online, so the supervisor sees where the time was worked.
 * The web version can only sample while the page is open. Tapping the notification calls onOpen with the visit's path.
 */
export function useVisitTracker(enabled: boolean, visit: { id: string; startedAt?: string | null } | undefined, onOpen: (path: string) => void) {
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  const visitId = visit?.id;
  const startedAtMs = (() => { const ms = Date.parse(visit?.startedAt ?? ''); return Number.isFinite(ms) ? ms : 0; })();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handle: { remove: () => Promise<void> } | undefined;
    let active = true;
    void VisitTracker.addListener('notificationTap', ({ deep_link }) => openRef.current(deep_link))
      .then((added) => { if (active) handle = added; else void added.remove(); }).catch(() => undefined);
    return () => { active = false; void handle?.remove(); };
  }, []);

  useEffect(() => {
    if (!enabled || !visitId) return;
    const native = Capacitor.isNativePlatform();
    const begin = startedAtMs || Date.now();
    let stopped = false;

    const upload = async () => { if (navigator.onLine && sessionStorage.getItem('nurse_access_token')) await flushQueue(sendPoints).catch(() => undefined); };
    const collectNative = async () => {
      try {
        const { points } = await VisitTracker.drain();
        enqueue(visitId, points.map((sample) => toPayload(visitId, begin, sample, true)));
      } catch { /* the next pass collects them */ }
    };
    const sampleOnce = async () => {
      const { snapshot, state } = await captureLocationWithStatus();
      const sample = { at: Date.now(), state, ...(snapshot.lat !== null && snapshot.lng !== null ? { lat: snapshot.lat, lng: snapshot.lng, accuracy: snapshot.accuracy_m } : {}) };
      enqueue(visitId, [toPayload(visitId, begin, sample, false)]);
    };
    const tick = async () => { if (native) await collectNative(); await upload(); };

    void (async () => {
      if (native) {
        try {
          const permission = await Geolocation.checkPermissions();
          if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') await Geolocation.requestPermissions();
          await VisitTracker.start({ visitId, startedAt: begin, intervalMs: SAMPLE_MS, title: 'Visit in progress', text: 'Your time and location are being recorded for this visit.' });
        } catch { /* The visit itself carries on; the notification and background samples are skipped. */ }
      }
      if (!stopped) { await sampleOnce().catch(() => undefined); await tick(); }
    })();

    const uploadTimer = window.setInterval(() => void tick(), UPLOAD_MS);
    const sampleTimer = native ? undefined : window.setInterval(() => void sampleOnce(), SAMPLE_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void tick(); };
    document.addEventListener('visibilitychange', onVisible);
    let appHandle: { remove: () => Promise<void> } | undefined;
    if (native) {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => { if (isActive) void tick(); })
        .then((added) => { if (stopped) void added.remove(); else appHandle = added; }).catch(() => undefined);
    }

    return () => {
      stopped = true;
      window.clearInterval(uploadTimer);
      if (sampleTimer) window.clearInterval(sampleTimer);
      document.removeEventListener('visibilitychange', onVisible);
      void appHandle?.remove();
      // The visit ended (or the nurse signed out): take the last samples, stop the notification, then send.
      void (async () => {
        if (native) { await collectNative(); await VisitTracker.stop().catch(() => undefined); }
        await upload();
      })();
    };
  }, [enabled, visitId, startedAtMs]);
}
