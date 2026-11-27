import { useEffect, useState } from 'react';
import { Banner } from '../../ui/Banner';
import { Card } from '../../ui/Card';
import { Chip } from '../../ui/Chip';
import { PillButton } from '../../ui/PillButton';
import type { FieldProfile } from '../../app/useFieldProfile';
import { unmcProblem } from './rules';
import { useCareFormsContext } from './useCareForms';
import { fetchAppAccess, pushToApp, type AppAccess } from '../../platform/appSwitch';
import { apiRequest } from '../../lib/api/client';
import { copy } from '../../copy';
import { isNativeAppSwitchAvailable, isOtherAppInstalled, launchOtherApp } from '../../platform/nativeAppSwitch';
import { OtherAppSuggestion } from './OtherAppSuggestion';

/** Profile: clinical registration (UNMC, nurse-only, self-declared until a different admin verifies) and the switch-app card. */
export function ProfileCareSection({ profile, suppressSuggestion = false }: { profile: FieldProfile | null; suppressSuggestion?: boolean }) {
  const care = useCareFormsContext();
  const reg = care?.registration;
  const [f, setF] = useState({ unmc_number: '', unmc_category: '', unmc_licence_expiry: '' });
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [appAccess, setAppAccess] = useState<AppAccess | null>(null);
  const [appSwitchBusy, setAppSwitchBusy] = useState(false);
  useEffect(() => { setF({ unmc_number: reg?.unmc_number ?? '', unmc_category: reg?.unmc_category ?? '', unmc_licence_expiry: reg?.unmc_licence_expiry ?? '' }); }, [reg]);
  useEffect(() => {
    if (!profile?.user_id) return;
    let live = true;
    void fetchAppAccess(<T,>(path: string) => apiRequest<T>(path))
      .then((result) => { if (live) setAppAccess(result); })
      .catch(() => { if (live) setAppAccess(null); });
    return () => { live = false; };
  }, [profile?.user_id]);
  if (!care) return null;
  const problem = unmcProblem(reg);
  const chip = problem?.code === 'missing' ? ['sc', 'Incomplete'] as const : problem?.code === 'expired' ? ['bad', 'Licence expired'] as const : reg?.verified ? ['ok', 'Verified by admin'] as const : ['pd', 'Self-declared'] as const;
  async function openAdminApp() {
    setAppSwitchBusy(true); setMsg('');
    try {
      const outcome = await pushToApp('admin', {
        currentApp: 'nurse',
        get: <T,>(path: string) => apiRequest<T>(path),
        post: <T,>(path: string, body: unknown, headers?: Record<string, string>) => apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body), headers }),
        fallbackUrl: profile?.admin_app_url,
        native: isNativeAppSwitchAvailable() ? { isInstalled: isOtherAppInstalled, launch: launchOtherApp } : undefined,
      });
      if (outcome === 'denied') {
        setMsg(copy.appSwitch.unavailable);
        void fetchAppAccess(<T,>(path: string) => apiRequest<T>(path)).then(setAppAccess).catch(() => setAppAccess(null));
      } else if (outcome === 'unavailable') setMsg(copy.appSwitch.unavailable);
    } catch { setMsg(copy.appSwitch.unavailable); } finally { setAppSwitchBusy(false); }
  }
  async function save() {
    setBusy(true); setMsg('');
    try { await care!.saveRegistration({ unmc_number: f.unmc_number.trim() || null, unmc_category: f.unmc_category.trim() || null, unmc_licence_expiry: f.unmc_licence_expiry || null }); setMsg('Saved. An admin can verify these details.'); }
    catch (e) { setMsg((e as { detail?: string }).detail ?? 'Could not save. Check your connection.'); } finally { setBusy(false); }
  }
  return <>
    <Card className="mk-profile-section cf-registration" id="profile-registration">
      <div className="mk-profile-section__heading"><h3>Clinical registration</h3><Chip kind={chip[0]}>{chip[1]}</Chip></div>
      <p>Used on every form you sign. Editing returns the details to self-declared until an admin verifies them.</p>
      <label>UNMC number<input value={f.unmc_number} onChange={(e) => setF({ ...f, unmc_number: e.target.value })} /></label>
      <label>Category<input value={f.unmc_category} placeholder="e.g. Registered nurse" onChange={(e) => setF({ ...f, unmc_category: e.target.value })} /></label>
      <label>Practising licence valid to<input type="date" value={f.unmc_licence_expiry} onChange={(e) => setF({ ...f, unmc_licence_expiry: e.target.value })} /></label>
      {problem && <Banner tone="warn">{problem.message}</Banner>}
      {msg && <Banner tone="info">{msg}</Banner>}
      <PillButton tone="gold" disabled={busy || !care.online} onClick={() => void save()}>{busy ? 'Saving…' : 'Save registration'}</PillButton>
      {!care.online && <p className="cf-hint">Connect to the internet to save.</p>}
    </Card>
    {!suppressSuggestion && profile?.user_id && appAccess && <OtherAppSuggestion userId={profile.user_id} access={appAccess} />}
    {((appAccess?.admin.allowed && appAccess.admin.url) || (!appAccess && profile?.can_switch_app && profile.admin_app_url)) && <Card className="mk-profile-section"><h3>Switch app</h3><p>{copy.appSwitch.intro}</p><PillButton tone="gold" disabled={appSwitchBusy} onClick={() => void openAdminApp()}>{appSwitchBusy ? 'Opening…' : copy.appSwitch.openAdmin}</PillButton></Card>}
  </>;
}
