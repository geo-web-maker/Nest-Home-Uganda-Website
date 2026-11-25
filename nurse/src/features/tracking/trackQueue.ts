import type { SavedPoint } from '../../plugins/VisitTracker';

/** The wire shape the server stores (POST /field/visits/{id}/track). */
export type TrackPointPayload = {
  id: string; client_op_id: string; device_time: string; elapsed_s: number;
  lat: number | null; lng: number | null; accuracy_m: number; state: SavedPoint['state']; background: boolean;
};
type Queued = { visitId: string; point: TrackPointPayload };

const KEY = 'nest.nurse.track-queue';
const MAX_QUEUED = 1500;
export const UPLOAD_BATCH = 100;

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `trk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function toPayload(visitId: string, startedAtMs: number, sample: SavedPoint, background: boolean): TrackPointPayload {
  return {
    id: newId(),
    client_op_id: `trk-${visitId}-${sample.at}-${background ? 'bg' : 'fg'}`,
    device_time: new Date(sample.at).toISOString(),
    elapsed_s: Math.max(0, Math.round((sample.at - startedAtMs) / 1000)),
    lat: typeof sample.lat === 'number' ? sample.lat : null,
    lng: typeof sample.lng === 'number' ? sample.lng : null,
    accuracy_m: sample.accuracy ?? 0,
    state: sample.state,
    background,
  };
}

export function readQueue(): Queued[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function writeQueue(items: Queued[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items.slice(-MAX_QUEUED))); } catch { /* storage full: the newest samples are the ones worth keeping, and the next write retries */ }
}
export function enqueue(visitId: string, points: TrackPointPayload[]) {
  if (points.length) writeQueue([...readQueue(), ...points.map((point) => ({ visitId, point }))]);
}

/**
 * Sends everything waiting. A sample the server already has is skipped server-side, so resending is safe.
 * The visit being gone (404) drops its samples; any other failure keeps them for the next try.
 */
export async function flushQueue(send: (visitId: string, points: TrackPointPayload[]) => Promise<void>): Promise<void> {
  const queued = readQueue();
  if (!queued.length) return;
  const byVisit = new Map<string, TrackPointPayload[]>();
  for (const item of queued) byVisit.set(item.visitId, [...(byVisit.get(item.visitId) ?? []), item.point]);
  const done = new Set<string>();
  for (const [visitId, points] of byVisit) {
    for (let index = 0; index < points.length; index += UPLOAD_BATCH) {
      const batch = points.slice(index, index + UPLOAD_BATCH);
      try {
        await send(visitId, batch);
      } catch (error) {
        const status = (error as { status?: number } | null)?.status;
        if (status !== 404) return writeQueue(queued.filter((item) => !done.has(item.point.client_op_id)));
      }
      for (const point of batch) done.add(point.client_op_id);
    }
  }
  writeQueue(queued.filter((item) => !done.has(item.point.client_op_id)));
}

/** Removes every waiting sample from this device (sign-out). */
export function clearQueue() {
  try { localStorage.removeItem(KEY); } catch { /* storage blocked: nothing was kept */ }
}
