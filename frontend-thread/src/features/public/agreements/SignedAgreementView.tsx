import { Button } from '../../../components/ui/Button';
import { signatureMethodLabel } from '../../agreements/SignatureMethodPicker';
import {
  fieldLabel,
  toText,
  when,
  type PublicAgreement,
} from './AgreementPublicParts';
import styles from './AgreementPublicPage.module.css';

type SignedAgreementViewProps = {
  agreement: PublicAgreement | null;
  viewPurpose: boolean;
  changeRequested: boolean;
  busy: boolean;
  onDownloadPdf: () => void;
};

/** The terminal state for the public agreement flow, including the sealed certificate. */
export function SignedAgreementView({
  agreement,
  viewPurpose,
  changeRequested,
  busy,
  onDownloadPdf,
}: SignedAgreementViewProps) {
  return (
    <div className={styles.done}>
      {viewPurpose && agreement ? (
        <>
          <div className={styles.signedBanner}>SIGNED AGREEMENT · {agreement.reference}</div>
          {agreement.variation_clause && (
            <div className={styles.notice}>
              AMENDMENT — This agreement varies clause {agreement.variation_clause}
              {agreement.parent_reference ? ` of agreement ${agreement.parent_reference}` : ''}.
            </div>
          )}
          {agreement.document_html ? (
            <iframe
              className={styles.document}
              title="Signed agreement"
              srcDoc={agreement.document_html}
              sandbox=""
            />
          ) : (
            <>
              <h2>Agreement clauses</h2>
              {Object.entries(agreement.clauses).map(([number, text]) => (
                <details key={number}>
                  <summary>Clause {number}</summary>
                  <div>
                    {text.split('\n').map((line, index) =>
                      line ? <p key={`${number}-${index}`}>{line}</p> : null,
                    )}
                  </div>
                </details>
              ))}
              <h2>Parties and schedules</h2>
              {Object.entries(agreement.fields).map(([path, field]) => (
                <div className={styles.formField} key={path}>
                  <label>
                    <span>{fieldLabel(path)}</span>
                    <small>{scheduleLabel(path)}</small>
                  </label>
                  <p>{toText(field.value) || '—'}</p>
                </div>
              ))}
            </>
          )}

          <div className={styles.fees}>
            <h3>Fee summary</h3>
            {Object.entries(agreement.schedule_b_computed).map(([key, value]) => (
              <p key={key}>
                <span>{key.replaceAll('_', ' ')}</span>
                <strong>{String(value)}</strong>
              </p>
            ))}
          </div>

          <h2>Signatures</h2>
          {(agreement.signatures ?? []).map((signature, index) => (
            <div className={styles.formField} key={`${signature.role}-${index}`}>
              <strong>{signature.role.replaceAll('_', ' ')}</strong>
              <p>{signature.name}</p>
              <small>
                {signatureMethodLabel(signature.method, signature.role)} ·{' '}
                {new Date(signature.signed_at).toLocaleString()}
              </small>
            </div>
          ))}

          {agreement.certificate && (
            <section className={styles.certificate} aria-labelledby="cert-title">
              <h2 id="cert-title">Certificate of completion</h2>
              {agreement.certificate.practice && (
                <div className={styles.error}>Practice agreement. No legal effect.</div>
              )}
              <dl className={styles.certGrid}>
                <div>
                  <dt>Reference</dt>
                  <dd>{agreement.certificate.reference ?? agreement.reference}</dd>
                </div>
                <div>
                  <dt>Client</dt>
                  <dd>{agreement.certificate.client || '—'}</dd>
                </div>
                <div>
                  <dt>Patient</dt>
                  <dd>{agreement.certificate.patient || '—'}</dd>
                </div>
                <div>
                  <dt>You signed</dt>
                  <dd>{when(agreement.certificate.client_signed_at)}</dd>
                </div>
                <div>
                  <dt>Bloomwell countersigned</dt>
                  <dd>{when(agreement.certificate.countersigned_at)}</dd>
                </div>
                <div>
                  <dt>Sealed</dt>
                  <dd>{when(agreement.certificate.sealed_at)}</dd>
                </div>
              </dl>
              {agreement.certificate.signers.map((signature, index) => (
                <p key={`${signature.role}-${index}`} className={styles.certSigner}>
                  <strong>{signature.name}</strong> ·{' '}
                  {signature.role === 'bloomwell' ? 'Bloomwell' : 'Client'} ·{' '}
                  {signatureMethodLabel(signature.method, signature.role)} ·{' '}
                  {when(signature.signed_at)}
                </p>
              ))}
              {agreement.certificate.content_hash && (
                <small className={styles.certHash}>
                  Fingerprint: {agreement.certificate.content_hash}
                </small>
              )}
            </section>
          )}

          <div className={styles.actionRow}>
            {agreement.pdf_available && (
              <Button onClick={onDownloadPdf} disabled={busy}>
                Download signed PDF
              </Button>
            )}
            <Button variant="outline" onClick={() => window.print()}>
              Print this page
            </Button>
          </div>
        </>
      ) : changeRequested ? (
        <>
          <div className={styles.successMark} aria-hidden="true">✓</div>
          <h2>Your change request was sent</h2>
          <p>
            The agreement link is paused. Bloomwell staff will review your request and send an
            updated link if needed.
          </p>
        </>
      ) : (
        <>
          <div className={styles.successMark} aria-hidden="true">✓</div>
          <h2>Your signature has been received</h2>
          <p>
            Bloomwell will countersign the agreement. When it is complete, we will email and text
            you a link. Open it, verify with a new code, and you can view the signed agreement and
            download your PDF copy, which also comes attached to the email.
          </p>
        </>
      )}
    </div>
  );
}

function scheduleLabel(path: string): string {
  if (path.startsWith('schedule_a.')) return 'Schedule A';
  if (path.startsWith('schedule_b.')) return 'Schedule B';
  if (path.startsWith('schedule_c.')) return 'Schedule C';
  return 'Parties';
}
