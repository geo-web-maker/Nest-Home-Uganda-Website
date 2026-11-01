export type GeoSnapshot = { lat: number; lng: number; radius_m: number };
export type GeoEvent = { lat: number | null; lng: number | null; accuracy_m: number };
const EARTH_RADIUS_M = 6_371_008.8;
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1); const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}
export function verifyLocation(event: GeoEvent, snapshot: GeoSnapshot, maxAccuracyM = 100): 'no_location' | 'low_accuracy' | 'verified' | 'outside_radius' {
  if (event.lat === null || event.lng === null) return 'no_location';
  if (event.accuracy_m > maxAccuracyM) return 'low_accuracy';
  return haversineM(event.lat, event.lng, snapshot.lat, snapshot.lng) <= snapshot.radius_m + Math.min(event.accuracy_m, 50) ? 'verified' : 'outside_radius';
}
