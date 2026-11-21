import { useEffect, useState } from 'react';
import { Banner } from '../../ui/Banner';
import { Card } from '../../ui/Card';
import { Chip } from '../../ui/Chip';
import { PillButton } from '../../ui/PillButton';
import type { FieldProfile } from '../../app/useFieldProfile';
import { unmcProblem } from './rules';
import { useCareFormsContext } from './useCareForms';

/** Profile: clinical registration (UNMC, nurse-only, self-declared until a different admin verifies) and the switch-app card. */
export function ProfileCareSection({ profile }: { profile: FieldProfile | null }) {
  const care = useCareFormsContext();
  const reg = care?.registration;
  const [f, setF] = useState({ unmc_number: '', unmc_category: '', unmc_licence_expiry: '' });
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { setF({ unmc_number: reg?.unmc_number ?? '', unmc_category: reg?.unmc_category ?? '', unmc_licence_expiry: reg?.unmc_licence_expiry ?? '' }); }, [reg]);
  if (!care) return null;
  const problem = unmcProblem(reg);
  const chip = problem?.code === 'missing' ? ['sc', 'Incomplete'] as const : problem?.code === 'expired' ? ['bad', 'Licence expired'] as const : reg?.verified ? ['ok', 'Verified by admin'] as const : ['pd', 'Self-declared'] as const;
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
    {profile?.can_switch_app && profile.admin_app_url && <Card className="mk-profile-section"><h3>Switch app</h3><p>Your account can also use the admin app. It opens as a separate session.</p><a className="mk-btn mk-btn--ghost" href={profile.admin_app_url}><span>Open admin app</span></a></Card>}
  </>;
}
