import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banner } from '../../ui/Banner';
import { PillButton } from '../../ui/PillButton';
import { SignaturePad } from './SignaturePad';
import { SignatureMethodPicker, type SignatureChoice } from './SignatureMethodPicker';
import { biometricAvailable, biometricEvidence, passphraseEvidence } from './signing';
import { clientSigningProblem, copyHint, nurseSigningProblem } from './rules';
import type { ClientSigPayload, NurseSigPayload } from './store';

type ClientProps = { mode: 'client'; formId: string; defaultName: string; autoEmail: boolean; clientAgreed: boolean; onClientAgreed: (v: boolean) => void; busy?: boolean; onSubmit: (s: ClientSigPayload) => void | Promise<void> };
type NurseProps = { mode: 'nurse'; formId: string; online: boolean; problem: { message: string } | null; busy?: boolean; onSubmit: (s: NurseSigPayload) => void | Promise<void> };

export function SigningBlock(props: ClientProps | NurseProps) {
  return props.mode === 'client' ? <ClientBlock {...props} /> : <NurseBlock {...props} />;
}

const ROLES = [['client', 'Client'], ['representative', 'Representative'], ['interpreter', 'Interpreter or reader'], ['witness', 'Witness']] as const;

function ClientBlock({ formId, defaultName, autoEmail, clientAgreed, onClientAgreed, busy, onSubmit }: ClientProps) {
  const [role, setRole] = useState<string>('client');
  const [name, setName] = useState(defaultName);
  const [authority, setAuthority] = useState('');
  const [email, setEmail] = useState('');
  const [esign, setEsign] = useState(false);
  const [method, setMethod] = useState<SignatureChoice>('drawn');
  const [pass, setPass] = useState(''); const [confirm, setConfirm] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [interp, setInterp] = useState({ name: '', address: '', language: '' });
  const [interpImage, setInterpImage] = useState<string | null>(null);
  const [bio, setBio] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { void biometricAvailable().then(setBio); }, []);

  async function submit() {
    const problem = clientSigningProblem({ role, method, name, authority, esign, hasImage: Boolean(image), passphrase: pass, confirm, interpreter: { ...interp, signed: Boolean(interpImage) } });
    if (problem) { setError(problem); return; }
    setError('');
    try {
      let evidence: Record<string, unknown> = {};
      if (method === 'password') evidence = await passphraseEvidence(pass);
      else if (method === 'biometric') evidence = await biometricEvidence(name.trim(), `form-${formId}`);
      else if (method === 'thumbprint') evidence = { interpreter_image: interpImage };
      const detail: Record<string, unknown> = {};
      if (role === 'representative') detail.authority = authority.trim();
      if (method === 'thumbprint') Object.assign(detail, { interpreter_name: interp.name.trim(), interpreter_address: interp.address.trim(), interpreter_language: interp.language.trim(), interpreter_signed: true });
      await onSubmit({ role, method, name: name.trim(), detail, evidence, image: method === 'drawn' || method === 'thumbprint' ? image : null, esign_consent: true, signer_email: role === 'representative' ? email.trim() || null : null });
    } catch (e) { setError(e instanceof Error ? e.message : 'Signing failed. Try another method.'); }
  }

  return <div className="cf-sign">
    <h3>Client signs here</h3>
    <p className="cf-hint">Hand the phone to the person signing. Nothing is signed for them in advance.</p>
    <div className="cf-tabs" role="group" aria-label="Who is signing?">{ROLES.map(([id, label]) => <button key={id} type="button" aria-pressed={role === id} onClick={() => setRole(id)}>{label}</button>)}</div>
    <label>Signer’s full name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
    {role === 'representative' && <>
      <label>Authority to sign (relationship and legal basis)<input value={authority} onChange={(e) => setAuthority(e.target.value)} /></label>
      {autoEmail && <label>Representative’s email for the copy (optional)<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>}
    </>}
    <SignatureMethodPicker mode="client" method={method} onMethod={setMethod} biometricAvailable={bio} password={pass} onPassword={setPass} confirm={confirm} onConfirm={setConfirm} allowThumbprint
      drawPanel={<SignaturePad label="Client signature" onChange={setImage} />}
      thumbPanel={<div className="cf-thumb"><p className="cf-hint">Press a clean thumb on the screen below. An interpreter or reader must give their details and sign.</p>
        <SignaturePad label="Thumbprint" onChange={setImage} />
        <label>Interpreter / reader name<input value={interp.name} onChange={(e) => setInterp({ ...interp, name: e.target.value })} /></label>
        <label>Address<input value={interp.address} onChange={(e) => setInterp({ ...interp, address: e.target.value })} /></label>
        <label>Language<input value={interp.language} onChange={(e) => setInterp({ ...interp, language: e.target.value })} /></label>
        <p className="cf-hint">Interpreter’s signature</p><SignaturePad label="Interpreter signature" onChange={setInterpImage} height={110} /></div>} />
    <label className="cf-check"><input type="checkbox" checked={esign} onChange={(e) => setEsign(e.target.checked)} />I agree to sign electronically.</label>
    <div className="cf-copy">
      <h4>Client copy</h4><p className="cf-hint">{copyHint(autoEmail, clientAgreed)}</p>
      {autoEmail && <label className="cf-check"><input type="checkbox" checked={clientAgreed} onChange={(e) => onClientAgreed(e.target.checked)} />The client agrees to receive a copy by email.</label>}
    </div>
    {error && <Banner tone="warn">{error}</Banner>}
    <PillButton tone="forest" size="full" disabled={busy} onClick={() => void submit()}>{busy ? 'Saving…' : 'Client signs'}</PillButton>
  </div>;
}

function NurseBlock({ online, problem, busy, onSubmit, formId }: NurseProps) {
  const [method, setMethod] = useState<SignatureChoice>('drawn');
  const [pass, setPass] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [bio, setBio] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { void biometricAvailable().then(setBio); }, []);
  async function submit() {
    const p = nurseSigningProblem(method, Boolean(image), pass, online);
    if (p) { setError(p); return; }
    setError('');
    try {
      const evidence = method === 'password' ? { password: pass } : method === 'biometric' ? await biometricEvidence('Clinician', `form-${formId}`) : {};
      await onSubmit({ method, evidence, image: method === 'drawn' ? image : null });
    } catch (e) { setError(e instanceof Error ? e.message : 'Signing failed.'); }
  }
  if (problem) return <div className="cf-sign"><Banner tone="warn">{problem.message}</Banner><Link className="cf-link" to="/profile">Open Profile</Link></div>;
  return <div className="cf-sign">
    <h3>Clinician signs here</h3>
    <SignatureMethodPicker mode="staff" method={method} onMethod={(m) => { setMethod(m); setError(''); }} biometricAvailable={bio} password={pass} onPassword={setPass} confirm="" onConfirm={() => undefined}
      drawPanel={<SignaturePad label="Clinician signature" onChange={setImage} />} />
    {error && <Banner tone="warn">{error}</Banner>}
    <PillButton tone="forest" size="full" disabled={busy} onClick={() => void submit()}>{busy ? 'Saving…' : 'Sign as clinician'}</PillButton>
  </div>;
}
