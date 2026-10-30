import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api/client';
import { clearSyncCursor, nurseDb } from '../offline/db';

export type FieldConsentRequirement = { type: string; version: string; text: string };
export type FieldProfile = {
  user_id: string;
  display_name?: string | null;
  email?: string | null;
  supervisor_name?: string | null;
  staff_number?: string;
  team_id?: string | null;
  supervisor_phone?: string | null;
  consents_required: FieldConsentRequirement[];
  settings?: { min_app_version?: string; adhoc_allowed?: boolean; photos_enabled?: boolean; photo_max_mb?: number; photo_guidance_text?: string; photo_required?: 'none' | 'arrival' | 'departure' | 'either' | 'both'; sos_enabled?: boolean; sos_disabled_reason?: string; emergency_numbers?: string[]; sos_hold_seconds?: number; sos_cancel_window_s?: number; live_follow_enabled?: boolean; live_follow_minutes?: number; live_follow_interval_seconds?: number };
};

/** Loads the authenticated profile and isolates local cache across shared-device accounts. */
export function useFieldProfile() {
  const [profile, setProfile] = useState<FieldProfile | null>(null);
  useEffect(() => {
    const owner = localStorage.getItem('nest.nurse.cache-user-id');
    if (!owner) return;
    void nurseDb.meta.get(`field_profile_display:${owner}`).then((cached) => {
      if (!cached?.value) return;
      try {
        const display = JSON.parse(cached.value) as Pick<FieldProfile, 'display_name' | 'email' | 'supervisor_name'>;
        setProfile((current) => {
          // A late IndexedDB read must never replace a profile loaded for a newly signed-in account.
          if (current && current.user_id !== owner) return current;
          return current ? { ...current, ...display } : { user_id: owner, consents_required: [], ...display };
        });
      } catch { /* An invalid display cache is ignored; the server remains authoritative. */ }
    }).catch(() => undefined);
  }, []);
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
      if (cachedOwner) {
        await clearSyncCursor(cachedOwner);
        // Do not leave another nurse's identity available on a shared device after an account switch.
        await nurseDb.meta.delete(`field_profile_display:${cachedOwner}`);
      }
      await clearSyncCursor(next.user_id);
      localStorage.setItem('nest.nurse.cache-user-id', next.user_id);
    }
    const display = { display_name: next.display_name ?? null, email: next.email ?? null, supervisor_name: next.supervisor_name ?? null };
    await nurseDb.meta.put({ key: `field_profile_display:${next.user_id}`, value: JSON.stringify(display) });
    setProfile(next);
    return next;
  }, []);
  const clearProfile = useCallback(() => setProfile(null), []);
  return { profile, setProfile, loadProfile, clearProfile };
}
