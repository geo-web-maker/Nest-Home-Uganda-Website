import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
export type LocationSnapshot = { lat: number | null; lng: number | null; accuracy_m: number };
export type LocationCaptureState = 'good' | 'low_accuracy' | 'denied' | 'unavailable';
export type LocationCaptureResult = { snapshot: LocationSnapshot; state: LocationCaptureState };
const emptyLocation = (): LocationSnapshot => ({ lat: null, lng: null, accuracy_m: 0 });

/** Capture only after an explicit foreground action; failure is reported without blocking the action. */
export async function captureLocationWithStatus(): Promise<LocationCaptureResult> {
  if (Capacitor.isNativePlatform()) {
    try {
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10_000 });
      const snapshot = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy_m: position.coords.accuracy };
      return { snapshot, state: snapshot.accuracy_m > 100 ? 'low_accuracy' : 'good' };
    } catch (error) {
      const detail = error instanceof Error ? error.message.toLowerCase() : '';
      return { snapshot: emptyLocation(), state: /permission|denied|not allowed/.test(detail) ? 'denied' : 'unavailable' };
    }
  }
  if (!('geolocation' in navigator)) return { snapshot: emptyLocation(), state: 'unavailable' };
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const snapshot = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy_m: position.coords.accuracy };
        resolve({ snapshot, state: snapshot.accuracy_m > 100 ? 'low_accuracy' : 'good' });
      },
      (error) => resolve({ snapshot: emptyLocation(), state: error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  });
}

export async function captureLocation(): Promise<LocationSnapshot> {
  return (await captureLocationWithStatus()).snapshot;
}
