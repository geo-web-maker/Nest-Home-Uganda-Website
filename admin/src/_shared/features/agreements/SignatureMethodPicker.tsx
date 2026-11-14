/* GENERATED from frontend/src. Edit there, then run: node scripts/sync-admin-shared.mjs */
import type { ReactNode } from 'react';
import styles from './SignatureMethodPicker.module.css';

export type SignatureChoice = 'drawn' | 'biometric' | 'password';

const LABELS: Record<string, string> = {
  drawn: 'Drawn signature', thumbprint: 'Thumbprint', password: 'Passphrase set by signer', biometric: 'Device passkey (biometric or screen lock)',
};
/** Staff re-enter their own account password (verified); a client only sets a passphrase. */
export function signatureMethodLabel(method: string, role?: string): string {
  if (method === 'password' && role === 'bloomwell') return 'Account password verified';
  return LABELS[method] ?? method.replaceAll('_', ' ');
}

export const MIN_PASSWORD_LENGTH = 8;

/** Client-side check only; the server re-validates everything. Returns an error message or null. */
export function credentialProblem(method: SignatureChoice, mode: 'client' | 'staff', password: string, confirm: string): string | null {
  if (method !== 'password') return null;
  if (password.length < MIN_PASSWORD_LENGTH) {
    return mode === 'staff' ? 'Enter your account password.' : `Choose a signing passphrase of at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (mode === 'client' && password !== confirm) return 'The two passphrases do not match.';
  return null;
}

type Props = {
  method: SignatureChoice;
  onMethod: (method: SignatureChoice) => void;
  biometricAvailable: boolean;
  mode: 'client' | 'staff';
  password: string;
  onPassword: (value: string) => void;
  confirm: string;
  onConfirm: (value: string) => void;
  /** The existing drawing pad. It stays mounted (hidden) so a half-drawn signature survives a tab switch. */
  drawPanel: ReactNode;
};

export function SignatureMethodPicker({ method, onMethod, biometricAvailable, mode, password, onPassword, confirm, onConfirm, drawPanel }: Props) {
  return (
    <div className={styles.picker}>
      <div className={styles.tabs} role="group" aria-label="How would you like to sign?">
        <button type="button" className={styles.tab} aria-pressed={method === 'drawn'} onClick={() => onMethod('drawn')}>Draw</button>
        {biometricAvailable && <button type="button" className={styles.tab} aria-pressed={method === 'biometric'} onClick={() => onMethod('biometric')}>Fingerprint / Face</button>}
        <button type="button" className={styles.tab} aria-pressed={method === 'password'} onClick={() => onMethod('password')}>{mode === 'staff' ? 'Account password' : 'Passphrase'}</button>
      </div>

      <div className={styles.panel} hidden={method !== 'drawn'}>{drawPanel}</div>

      {method === 'biometric' && <div className={styles.panel}>
        <p className={styles.hint}>
          Your phone will ask for your fingerprint, face or screen lock. Your biometric never leaves your device;
          only a confirmation tied to this exact version of the agreement is recorded.
        </p>
      </div>}

      {method === 'password' && <div className={styles.panel}>
        {mode === 'staff'
          ? <label>Your account password<input type="password" autoComplete="current-password" value={password} onChange={(e) => onPassword(e.target.value)} /></label>
          : <>
              <p className={styles.hint}>Choose a passphrase to sign with. It is stored only as a secure hash and is never shown again.</p>
              <label>Signing passphrase<input type="password" autoComplete="new-password" value={password} onChange={(e) => onPassword(e.target.value)} /></label>
              <label>Repeat passphrase<input type="password" autoComplete="new-password" value={confirm} onChange={(e) => onConfirm(e.target.value)} /></label>
            </>}
      </div>}

      {!biometricAvailable && <p className={styles.unavailable}>Fingerprint / face signing is not available in this browser or on this device.</p>}
    </div>
  );
}
