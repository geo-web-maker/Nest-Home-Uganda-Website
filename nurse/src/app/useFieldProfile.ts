import { useCallback, useState } from 'react';
import { apiRequest } from '../lib/api/client';
import { clearSyncCursor, nurseDb } from '../offline/db';

export type FieldConsentRequirement = { type: string; version: string; text: string };
export type FieldProfile = {
  user_id: string;
  staff_number?: string;
  team_id?: string | null;
  supervisor_phone?: string | null;
  consents_required: FieldConsentRequirement[];
  settings?: { min_app_version?: string; adhoc_allowed?: boolean; photos_enabled?: boolean; photo_max_mb?: number; photo_guidance_text?: string; photo_required?: 'none' | 'arrival' | 'departure' | 'either' | 'both'; sos_enabled?: boolean; sos_disabled_reason?: string; emergency_numbers?: string[]; sos_hold_seconds?: number; sos_cancel_window_s?: number; live_follow_enabled?: boolean; live_follow_minutes?: number; live_follow_interval_seconds?: number };
};

/** Loads the authenticated profile and isolates local cache across shared-device accounts. */
export function useFieldProfile() {
  const [profile, setProfile] = useState<FieldProfile | null>(null);
  const loadProfile = useCallback(async () => {
    const next = await apiRequest<FieldProfile>('/field/me');
    const cachedOwner = localStorage.getItem('nest.nurse.cache-user-id');
    if (cachedOwner !== next.user_id) {
      await nurseDb.transaction('rw', nurseDb.visits, nurseDb.history, nurseDb.clients, nurseDb.consents, async () => {
        await nurseDb.visits.clear();
        await nurseDb.history.clear();
        await nurseDb.clients.clear();
        await nurseDb.consents.clear();
      });
      if (cachedOwner) await clearSyncCursor(cachedOwner);
      await clearSyncCursor(next.user_id);
      localStorage.setItem('nest.nurse.cache-user-id', next.user_id);
    }
    setProfile(next);
    return next;
  }, []);
  const clearProfile = useCallback(() => setProfile(null), []);
  return { profile, setProfile, loadProfile, clearProfile };
}
