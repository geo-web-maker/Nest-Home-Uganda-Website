import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api/client';
import { clearSyncCursor, nurseDb } from '../offline/db';
import { purgeOtherOwnersMail } from '../features/mail/mailStore';
import { clearPdfCache } from '../features/careforms/pdfCache';

export type FieldConsentRequirement = { type: string; version: string; text: string };
export type FieldProfile = {
  user_id: string;
  display_name?: string | null;
  email?: string | null;
  supervisor_name?: string | null;
  staff_number?: string;
  team_id?: string | null;
  supervisor_phone?: string | null;
  can_switch_app?: boolean;
  admin_app_url?: string;
  consents_required: FieldConsentRequirement[];
  settings?: { min_app_version?: string; adhoc_allowed?: boolean; photos_enabled?: boolean; photo_max_mb?: number; photo_guidance_text?: string; photo_required?: 'none' | 'arrival' | 'departure' | 'either' | 'both'; sos_enabled?: boolean; sos_disabled_reason?: string; emergency_numbers?: string[]; sos_hold_seconds?: number; sos_cancel_window_s?: number; live_follow_enabled?: boolean; live_follow_minutes?: number; live_follow_interval_seconds?: number };
};

const fullProfileKey = (owner: string) => `field_profile:${owner}`;

/** The last profile the server sent for this account (settings, SOS numbers, consents), for cold starts without a network. */
export async function readCachedProfile(owner: string): Promise<FieldProfile | null> {
  try {
    const full = await nurseDb.meta.get(fullProfileKey(owner));
    if (full?.value) { const parsed = JSON.parse(full.value) as FieldProfile; if (parsed?.user_id === owner) return parsed; }
  } catch { /* fall through to the display-only cache */ }
  try {
    const display = await nurseDb.meta.get(`field_profile_display:${owner}`);
    const parsed = display?.value ? JSON.parse(display.value) as Pick<FieldProfile, 'display_name' | 'email' | 'supervisor_name'> : {};
    return { user_id: owner, consents_required: [], ...parsed };
  } catch { return { user_id: owner, consents_required: [] }; }
}
export async function forgetCachedProfile(owner: string): Promise<void> {
  if (!owner) return;
  try { await nurseDb.meta.delete(fullProfileKey(owner)); await nurseDb.meta.delete(`field_profile_display:${owner}`); } catch { /* best effort */ }
}

/** Loads the authenticated profile and isolates local cache across shared-device accounts. */
export function useFieldProfile() {
  const [profile, setProfile] = useState<FieldProfile | null>(null);
  /** Set when the server says this account has no active nurse profile (404) or no field access (403). */
  const [accessProblem, setAccessProblem] = useState<'not_nurse' | null>(null);
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
    let next: FieldProfile;
    try {
      next = await apiRequest<FieldProfile>('/field/me');
      setAccessProblem(null);
    } catch (error) {
      const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status?: unknown }).status) : -1;
      if (status === 403 || status === 404) setAccessProblem('not_nurse');
      throw error;
    }
    const cachedOwner = localStorage.getItem('nest.nurse.cache-user-id');
    if (cachedOwner !== next.user_id) {
      await nurseDb.transaction('rw', nurseDb.visits, nurseDb.history, nurseDb.clients, nurseDb.consents, async () => {
        await nurseDb.visits.clear();
        await nurseDb.history.clear();
        await nurseDb.clients.clear();
        await nurseDb.consents.clear();
      });
      // Unsent mail belongs to whoever wrote it: another nurse's drafts and cached messages are removed on a switch.
      await purgeOtherOwnersMail(next.user_id);
      if (cachedOwner) {
        await clearSyncCursor(cachedOwner);
        // Do not leave another nurse's identity available on a shared device after an account switch.
        await nurseDb.meta.delete(`field_profile_display:${cachedOwner}`);
        await nurseDb.meta.delete(fullProfileKey(cachedOwner));
        await clearPdfCache();
      }
      await clearSyncCursor(next.user_id);
      localStorage.setItem('nest.nurse.cache-user-id', next.user_id);
    }
    const display = { display_name: next.display_name ?? null, email: next.email ?? null, supervisor_name: next.supervisor_name ?? null };
    await nurseDb.meta.put({ key: `field_profile_display:${next.user_id}`, value: JSON.stringify(display) });
    await nurseDb.meta.put({ key: fullProfileKey(next.user_id), value: JSON.stringify(next) });
    setProfile(next);
    return next;
  }, []);
  const clearProfile = useCallback(() => { setProfile(null); setAccessProblem(null); }, []);
  return { profile, setProfile, loadProfile, clearProfile, accessProblem };
}
