import type { PointerEventHandler, RefObject } from 'react';
import { Button } from '../../../components/ui/Button';
import { Checkbox } from '../../../components/ui/Checkbox';
import { Field } from '../../../components/ui/Field';
import {
  SignatureMethodPicker,
  type SignatureChoice,
} from '../../agreements/SignatureMethodPicker';
import { ESIGN_CONSENT_TEXT, type PublicAgreement } from './AgreementPublicParts';
import styles from './AgreementPublicPage.module.css';

type AgreementSigningPanelProps = {
  agreement: PublicAgreement;
  name: string;
  onNameChange: (value: string) => void;
  method: SignatureChoice;
  onMethodChange: (value: SignatureChoice) => void;
  biometricAvailable: boolean;
  password: string;
  onPasswordChange: (value: string) => void;
  confirmPassword: string;
  onConfirmPasswordChange: (value: string) => void;
  signatureCanvas: RefObject<HTMLCanvasElement>;
  onBeginStroke: PointerEventHandler<HTMLCanvasElement>;
  onDrawStroke: PointerEventHandler<HTMLCanvasElement>;
  onEndStroke: PointerEventHandler<HTMLCanvasElement>;
  esignConsent: boolean;
  onEsignConsentChange: (value: boolean) => void;
  onClearSignature: () => void;
  onSign: () => void;
  busy: boolean;
  changeOpen: boolean;
  onChangeOpen: (open: boolean) => void;
  changeReason: string;
  onChangeReason: (value: string) => void;
  onSendChangeRequest: () => void;
};

/** Keeps the final review/sign controls out of the public page's data-loading component. */
export function AgreementSigningPanel({
  agreement,
  name,
  onNameChange,
  method,
  onMethodChange,
  biometricAvailable,
  password,
  onPasswordChange,
  confirmPassword,
  onConfirmPasswordChange,
  signatureCanvas,
  onBeginStroke,
  onDrawStroke,
  onEndStroke,
  esignConsent,
  onEsignConsentChange,
  onClearSignature,
  onSign,
  busy,
  changeOpen,
  onChangeOpen,
  changeReason,
  onChangeReason,
  onSendChangeRequest,
}: AgreementSigningPanelProps) {
  return (
    <div className={styles.signBand}>
      <section className={styles.feesPane} aria-label="Fee summary">
        <div className={styles.fees}>
          <h3>Schedule B fee summary</h3>
          {Object.entries(agreement.schedule_b_computed).map(([key, value]) => (
            <p key={key}>
              <span>{key.replaceAll('_', ' ')}</span>
              <strong>
                {typeof value === 'number'
                  ? value.toLocaleString('en-US', { maximumFractionDigits: 2 })
                  : String(value)}
              </strong>
            </p>
          ))}
        </div>
      </section>

      <section className={styles.signPane} aria-label="Sign your agreement">
        {agreement.is_test && (
          <p className={styles.security}>
            <strong>Practice agreement.</strong> This is for testing only and has no legal effect.
          </p>
        )}
        <h2>Sign your agreement</h2>
        <p>
          By signing, you confirm that you have reviewed the agreement and the information shown
          above. Your signature is bound to this exact version.
        </p>
        <Field label="Your full name" value={name} onChange={(event) => onNameChange(event.target.value)} autoComplete="name" />
        <SignatureMethodPicker
          method={method}
          onMethod={onMethodChange}
          biometricAvailable={biometricAvailable}
          mode="client"
          password={password}
          onPassword={onPasswordChange}
          confirm={confirmPassword}
          onConfirm={onConfirmPasswordChange}
          drawPanel={
            <>
              <label className={styles.plain}>Draw your signature below</label>
              <canvas
                ref={signatureCanvas}
                className={styles.signature}
                width={800}
                height={180}
                aria-label="Signature drawing area"
                onPointerDown={onBeginStroke}
                onPointerMove={onDrawStroke}
                onPointerUp={onEndStroke}
                onPointerCancel={onEndStroke}
              />
            </>
          }
        />
        <Checkbox
          label={ESIGN_CONSENT_TEXT}
          checked={esignConsent}
          onChange={(event) => onEsignConsentChange(event.target.checked)}
        />
        <div className={styles.signatureActions}>
          {method === 'drawn' && (
            <Button variant="outline" onClick={onClearSignature} disabled={busy}>
              Clear signature
            </Button>
          )}
          <Button onClick={onSign} disabled={busy || !esignConsent} aria-busy={busy || undefined}>
            {method === 'biometric'
              ? 'Sign with fingerprint / face'
              : method === 'password'
                ? 'Sign with my passphrase'
                : 'Submit my signature'}
          </Button>
        </div>

        {!changeOpen && (
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => onChangeOpen(true)}
            disabled={busy}
          >
            Request a change instead
          </button>
        )}
        {changeOpen && (
          <div className={styles.changePanel}>
            <Field
              kind="textarea"
              label="Tell Bloomwell what you would like changed"
              value={changeReason}
              rows={4}
              onChange={(event) => onChangeReason(event.target.value)}
            />
            <div className={styles.actionRow}>
              <Button onClick={onSendChangeRequest} disabled={busy} aria-busy={busy || undefined}>
                Send request
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  onChangeOpen(false);
                  onChangeReason('');
                }}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
            <p className={styles.security}>
              Sending a change request pauses this link while Bloomwell reviews it.
            </p>
          </div>
        )}
        <p className={styles.security}>
          A typed name alone is not accepted as a signature. Sign by drawing with your finger,
          stylus or mouse, by confirming with your phone&apos;s fingerprint or face, or with a
          passphrase you choose.
        </p>
      </section>
    </div>
  );
}
