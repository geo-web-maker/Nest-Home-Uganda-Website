import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import type { CachedVisit } from '../offline/db';
import { copy } from '../copy';

const OWNED_ID_START = 120_000_000;
const OWNED_ID_END = 219_999_999;
const REMINDER_WINDOW_MS = 60_000;

export type VisitReminder = { id: number; visitId: string; kind: 'starting_soon' | 'start_time' | 'still_working'; at: Date; title: string; body: string };

function stableId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return OWNED_ID_START + (Math.abs(hash) % (OWNED_ID_END - OWNED_ID_START));
}

/** Pure reminder builder. Messages intentionally omit client names, addresses and health details. */
export function buildVisitReminderSchedule(visits: CachedVisit[], now = new Date()): VisitReminder[] {
  const nowMs = now.getTime();
  const reminders: VisitReminder[] = [];
  for (const visit of visits) {
    if (visit.status !== 'scheduled' && visit.status !== 'in_progress') continue;
    const startMs = Date.parse(visit.scheduled_start);
    const endMs = Date.parse(visit.scheduled_end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    const candidates: Array<{ kind: VisitReminder['kind']; atMs: number; title: string; body: string }> = [
      { kind: 'starting_soon', atMs: startMs - 15 * 60_000, title: copy.notifications.startingSoonTitle, body: copy.notifications.startingSoonBody },
      { kind: 'start_time', atMs: startMs, title: copy.notifications.startTimeTitle, body: copy.notifications.startTimeBody },
      { kind: 'still_working', atMs: endMs, title: copy.notifications.endTimeTitle, body: copy.notifications.endTimeBody },
    ];
    for (const candidate of candidates) {
      if (candidate.atMs <= nowMs + REMINDER_WINDOW_MS) continue;
      reminders.push({ id: stableId(`${visit.id}:${candidate.kind}`), visitId: visit.id, kind: candidate.kind, at: new Date(candidate.atMs), title: candidate.title, body: candidate.body });
    }
  }
  return reminders.sort((left, right) => left.at.getTime() - right.at.getTime());
}

export async function enableVisitReminders(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const permission = await LocalNotifications.checkPermissions();
  const result = permission.display === 'granted' ? permission : await LocalNotifications.requestPermissions();
  if (result.display !== 'granted') return false;
  try {
    await LocalNotifications.createChannel({ id: 'nest_normal', name: copy.notifications.channelName, description: copy.notifications.channelDescription, importance: 3, visibility: 1, vibration: true });
  } catch {
    // Some platforms or plugin versions do not expose Android channels; scheduling can still work.
  }
  return true;
}

export async function scheduleVisitReminders(visits: CachedVisit[], now = new Date()): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const pending = await LocalNotifications.getPending();
  const owned = pending.notifications.filter((notification) => notification.id >= OWNED_ID_START && notification.id <= OWNED_ID_END);
  if (owned.length) await LocalNotifications.cancel({ notifications: owned.map((notification) => ({ id: notification.id })) });
  const reminders = buildVisitReminderSchedule(visits, now);
  if (!reminders.length) return;
  const notifications: LocalNotificationSchema[] = reminders.map((reminder) => ({
    id: reminder.id,
    title: reminder.title,
    body: reminder.body,
    schedule: { at: reminder.at, allowWhileIdle: true },
    channelId: 'nest_normal',
    extra: { visit_id: reminder.visitId, reminder_kind: reminder.kind },
  }));
  await LocalNotifications.schedule({ notifications });
}
