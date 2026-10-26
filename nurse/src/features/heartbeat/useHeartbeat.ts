import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { APP_VERSION } from '../../copy';
import { apiRequest } from '../../lib/api/client';

const HEARTBEAT_INTERVAL_MS = 60_000;
function deviceId(): string {
  const key = 'nest.nurse.device-id';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const generated = globalThis.crypto?.randomUUID?.() ?? `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(key, generated);
  return generated;
}
function platformName(): 'android' | 'ios' | 'web' {
  const platform = Capacitor.getPlatform();
  return platform === 'android' || platform === 'ios' ? platform : 'web';
}

/** Foreground-only check-in heartbeat. No background timer or location collection is used. */
export function useHeartbeat(enabled: boolean, activeVisitId?: string) {
  useEffect(() => {
    if (!enabled || !activeVisitId) return;
    let stopped = false;
    let active = true;
    const send = async () => {
      if (stopped || !sessionStorage.getItem('nurse_access_token') || !navigator.onLine) return;
      try {
        await apiRequest('/field/heartbeat', { method: 'POST', body: JSON.stringify({ device_id: deviceId(), app_version: APP_VERSION, platform: platformName() }) });
      } catch { /* The next foreground tick will retry; heartbeat failures do not block the visit. */ }
    };
    void send();
    const timer = window.setInterval(() => void send(), HEARTBEAT_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void send(); };
    document.addEventListener('visibilitychange', onVisible);
    let appStateHandle: { remove: () => Promise<void> } | undefined;
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => { if (isActive) void send(); })
        .then((handle) => { if (!active) void handle.remove(); else appStateHandle = handle; }).catch(() => undefined);
    }
    return () => {
      active = false;
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      void appStateHandle?.remove();
    };
  }, [enabled, activeVisitId]);
}
