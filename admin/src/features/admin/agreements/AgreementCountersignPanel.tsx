import type { PointerEventHandler, RefObject } from 'react';
import { Button } from '@shared/components/ui/Button';
import { ButtonGroup } from '@shared/components/dialogs/ButtonGroup';
import { Field } from '@shared/components/ui/Field';
import {
  SignatureMethodPicker,
  type SignatureChoice,
} from '@shared/features/agreements/SignatureMethodPicker';
import styles from './AgreementsPage.module.css';

type AgreementCountersignPanelProps = {
  canSign: boolean;
  status: string;
  busy: boolean;
  signatoryName: string;
  onSignatoryNameChange: (value: string) => void;
  method: SignatureChoice;
  onMethodChange: (value: SignatureChoice) => void;
  biometricAvailable: boolean;
  password: string;
  onPasswordChange: (value: string) => void;
  signatureCanvas: RefObject<HTMLCanvasElement>;
  onBeginSignature: PointerEventHandler<HTMLCanvasElement>;
  onMoveSignature: PointerEventHandler<HTMLCanvasElement>;
  onEndSignature: PointerEventHandler<HTMLCanvasElement>;
  onClearSignature: () => void;
  onCountersign: () => void;
};

/** Isolates the staff signature workflow from the agreement editor's other actions. */
export function AgreementCountersignPanel({
  canSign,
  status,
  busy,
  signatoryName,
  onSignatoryNameChange,
  method,
  onMethodChange,
  biometricAvailable,
  password,
  onPasswordChange,
  signatureCanvas,
  onBeginSignature,
  onMoveSignature,
  onEndSignature,
  onClearSignature,
  onCountersign,
}: AgreementCountersignPanelProps) {
  if (!canSign || status !== 'client_signed') return null;

  return (
    <section className={styles.countersign}>
      <h3>Bloomwell countersignature</h3>
      <p>
        By countersigning, the system seals the agreement and stores its PDF in private storage.
      </p>
      <Field
        label="Authorised signatory name"
        value={signatoryName}
        onChange={(event) => onSignatoryNameChange(event.target.value)}
      />
      <SignatureMethodPicker
        method={method}
        onMethod={onMethodChange}
        biometricAvailable={biometricAvailable}
        mode="staff"
        password={password}
        onPassword={onPasswordChange}
        confirm=""
        onConfirm={() => undefined}
        drawPanel={
          <canvas
            ref={signatureCanvas}
            className={styles.signaturePad}
            width={800}
            height={160}
            aria-label="Bloomwell countersignature area"
            onPointerDown={onBeginSignature}
            onPointerMove={onMoveSignature}
            onPointerUp={onEndSignature}
            onPointerCancel={onEndSignature}
          />
        }
      />
      <ButtonGroup>
        {method === 'drawn' && (
          <Button variant="outline" onClick={onClearSignature}>Clear signature</Button>
        )}
        <Button onClick={onCountersign} disabled={busy}>Countersign and seal</Button>
      </ButtonGroup>
    </section>
  );
}
