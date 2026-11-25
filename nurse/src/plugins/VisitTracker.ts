import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/** One location sample saved by the Android service while the visit was running. `at` is epoch milliseconds. */
export type SavedPoint = { at: number; state: 'good' | 'low_accuracy' | 'denied' | 'unavailable'; lat?: number; lng?: number; accuracy?: number };

export interface VisitTrackerPlugin {
  /** Starts the ongoing stopwatch notification and the location sampling. Safe to call again for the same visit. */
  start(options: { visitId: string; startedAt: number; intervalMs?: number; title?: string; text?: string }): Promise<void>;
  stop(): Promise<void>;
  status(): Promise<{ running: boolean; visitId: string; startedAt: number }>;
  /** Returns every sample saved since the last call, and clears them on the device. */
  drain(): Promise<{ points: SavedPoint[] }>;
  /** Fires when the person taps the stopwatch notification. */
  addListener(eventName: 'notificationTap', listener: (event: { deep_link: string }) => void): Promise<PluginListenerHandle>;
}

export const VisitTracker = registerPlugin<VisitTrackerPlugin>('VisitTracker');
