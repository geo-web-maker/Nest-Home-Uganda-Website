import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiRequest } from '../../lib/api/client';
import { arriveBlocked as arriveBlockedRule, type PatientType, type Registration } from './rules';
import { prefetchPdfs } from './pdfCache';
import { applyLocal, overlayPending, pendingCareOps, queueSubmit, readBootstrap, readRegistrationCache, writeBootstrap, writeRegistrationCache, type Bootstrap, type DocRow, type SubmitPayload } from './store';

export type CareForms = {
  ready: boolean; online: boolean; boot: Bootstrap | null; registration: Registration | null; userId: string;
  autoEmail: boolean;
  typeOf: (clientId?: string | null) => PatientType;
  docsFor: (clientId?: string | null) => DocRow[];
  signedIds: (clientId?: string | null) => string[];
  arriveBlocked: (clientId?: string | null) => boolean;
  submit: (p: SubmitPayload) => Promise<{ sent: boolean }>;
  saveRegistration: (r: Pick<Registration, 'unmc_number' | 'unmc_category' | 'unmc_licence_expiry'>) => Promise<void>;
  refresh: () => Promise<void>;
};
const Ctx = createContext<CareForms | null>(null);
export const CareFormsProvider = ({ value, children }: { value: CareForms; children: ReactNode }) => <Ctx.Provider value={value}>{children}</Ctx.Provider>;
export const useCareFormsContext = () => useContext(Ctx);

export function useCareForms({ userId, token, online, onQueued }: { userId: string; token: string | null; online: boolean; onQueued: () => void }): CareForms {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [registration, setRegistration] = useState<Registration | null>(null);
  const refresh = useCallback(async () => {
    if (!userId) { setBoot(null); setRegistration(null); return; }
    let b = await readBootstrap(userId);
    let reg = await readRegistrationCache<Registration>(userId);
    if (online && token) {
      try { b = await apiRequest<Bootstrap>('/field/care-forms/bootstrap'); await writeBootstrap(userId, b); void prefetchPdfs(b.documents); } catch { /* the cache stays usable offline */ }
      try { reg = await apiRequest<Registration>('/field/care-forms/me/registration'); await writeRegistrationCache(userId, reg); } catch { /* same */ }
    }
    if (b) setBoot(overlayPending(b, await pendingCareOps(userId)));
    setRegistration(reg);
  }, [userId, token, online]);
  useEffect(() => { void refresh(); }, [refresh]);

  const docsFor = useCallback((clientId?: string | null) => (boot?.documents ?? []).filter((d) => !clientId || d.client_id === clientId), [boot]);
  const signedIds = useCallback((clientId?: string | null) => docsFor(clientId).filter((d) => d.status === 'signed').map((d) => d.form_id), [docsFor]);
  const typeOf = useCallback((clientId?: string | null): PatientType => boot?.clients.find((c) => c.id === clientId)?.patient_type ?? 'General', [boot]);

  const submit = useCallback(async (p: SubmitPayload) => {
    const password = p.nurse_signature?.method === 'password';
    if (password) { // the account password is never written to the offline queue
      if (!online) throw new Error('Account password signing needs a connection.');
      await apiRequest('/field/care-forms/submit', { method: 'POST', body: JSON.stringify(p) });
      await refresh();
      return { sent: true };
    }
    await queueSubmit(userId, p);
    if (boot) setBoot(applyLocal(boot, p));
    onQueued();
    return { sent: false };
  }, [online, userId, boot, refresh, onQueued]);

  const saveRegistration = useCallback(async (r: Pick<Registration, 'unmc_number' | 'unmc_category' | 'unmc_licence_expiry'>) => {
    const next = await apiRequest<Registration>('/field/care-forms/me/registration', { method: 'PATCH', body: JSON.stringify(r) });
    setRegistration(next); await writeRegistrationCache(userId, next);
  }, [userId]);

  return useMemo(() => ({
    ready: boot !== null, online, boot, registration, userId, autoEmail: Boolean(boot?.auto_email_copy), typeOf, docsFor, signedIds,
    arriveBlocked: (clientId) => Boolean(clientId) && arriveBlockedRule(Boolean(boot?.gates_enabled), signedIds(clientId)),
    submit, saveRegistration, refresh,
  }), [boot, registration, online, userId, typeOf, docsFor, signedIds, submit, saveRegistration, refresh]);
}
