import type { ReactNode } from 'react';

/** Nurse-app copy of the agreement SignatureMethodPicker (same labels and rules), styled with the app's global classes. */
export type SignatureChoice = 'drawn' | 'biometric' | 'password' | 'thumbprint';
type Props = {
  method: SignatureChoice; onMethod: (m: SignatureChoice) => void; biometricAvailable: boolean; mode: 'client' | 'staff';
  password: string; onPassword: (v: string) => void; confirm: string; onConfirm: (v: string) => void; drawPanel: ReactNode; allowThumbprint?: boolean; thumbPanel?: ReactNode;
};
export function SignatureMethodPicker({ method, onMethod, biometricAvailable, mode, password, onPassword, confirm, onConfirm, drawPanel, allowThumbprint = false, thumbPanel }: Props) {
  return <div className="cf-picker">
    <div className="cf-tabs" role="group" aria-label="How would you like to sign?">
      <button type="button" aria-pressed={method === 'drawn'} onClick={() => onMethod('drawn')}>Draw</button>
      {biometricAvailable && <button type="button" aria-pressed={method === 'biometric'} onClick={() => onMethod('biometric')}>Fingerprint / Face</button>}
      <button type="button" aria-pressed={method === 'password'} onClick={() => onMethod('password')}>{mode === 'staff' ? 'Account password' : 'Passphrase'}</button>
      {allowThumbprint && <button type="button" aria-pressed={method === 'thumbprint'} onClick={() => onMethod('thumbprint')}>Thumbprint</button>}
    </div>
    <div hidden={method !== 'drawn'}>{drawPanel}</div>
    {method === 'biometric' && <p className="cf-hint">Your phone will ask for a fingerprint, face or screen lock. Only a confirmation is recorded; the biometric never leaves the device.</p>}
    {method === 'password' && (mode === 'staff'
      ? <label>Your account password<input type="password" autoComplete="current-password" value={password} onChange={(e) => onPassword(e.target.value)} /></label>
      : <><p className="cf-hint">Choose a passphrase to sign with (8 or more characters). It is stored only as a salted hash.</p>
        <label>Signing passphrase<input type="password" autoComplete="new-password" value={password} onChange={(e) => onPassword(e.target.value)} /></label>
        <label>Repeat passphrase<input type="password" autoComplete="new-password" value={confirm} onChange={(e) => onConfirm(e.target.value)} /></label></>)}
    {method === 'thumbprint' && thumbPanel}
    {!biometricAvailable && <p className="cf-hint">Fingerprint / face signing is not available on this device.</p>}
  </div>;
}
