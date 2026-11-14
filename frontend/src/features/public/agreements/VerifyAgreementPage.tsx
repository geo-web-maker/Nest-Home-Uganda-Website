import { useEffect, useState, type ChangeEvent } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, apiClient } from '../../../lib/api/client';
import { LogoMark } from '../../../components/brand/Logo';
import styles from './AgreementPublicPage.module.css';
import verify from './VerifyAgreementPage.module.css';
import { VerifyBillingPanel } from '../billing/VerifyBillingPanel';

type Verified = {
  valid: true; reference: string; practice: boolean; client_name: string;
  client_signed_at?: string | null; countersigned_at?: string | null; sealed_at?: string | null;
  content_hash: string; pdf_sha256: string;
};
type Check = { state: 'match' | 'differs' | 'error'; name: string } | null;

const when = (value?: string | null) => (value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function VerifyAgreementLegacyPage() {
  const { reference = '', code = '' } = useParams();
  const [result, setResult] = useState<Verified | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'notfound' | 'busy' | 'error'>('loading');
  const [check, setCheck] = useState<Check>(null);

  useEffect(() => {
    document.title = 'Verify a signed agreement | Bloomwell Home Care Uganda';
    let live = true;
    apiClient.get<Verified>(`/public/agreements/verify/${encodeURIComponent(reference)}/${encodeURIComponent(code)}`)
      .then((data) => { if (live) { setResult(data); setState('ok'); } })
      .catch((cause) => {
        if (!live) return;
        setState(cause instanceof ApiError ? (cause.status === 404 ? 'notfound' : cause.status === 429 ? 'busy' : 'error') : 'error');
      });
    return () => { live = false; };
  }, [reference, code]);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !result) return;
    try {
      const hash = await sha256Hex(file);
      setCheck({ state: hash === result.pdf_sha256 ? 'match' : 'differs', name: file.name });
    } catch { setCheck({ state: 'error', name: file.name }); }
  };

  return <main className={styles.page}>
    <header className={styles.brand}><span className={styles.brandMark}><LogoMark variant="site" /></span><div><strong>Bloomwell Home Care</strong><small>Signed agreement check</small></div></header>
    <section className={styles.card}>
      <p className={styles.eyebrow}>BLOOMWELL HOME CARE UGANDA LIMITED</p>
      <h1>Verify a signed agreement</h1>

      {state === 'loading' && <p role="status">Checking this agreement…</p>}

      {state === 'notfound' && <div className={verify.result} data-tone="bad" role="alert">
        <span className={verify.seal} aria-hidden="true">!</span>
        <div><h2>We could not match this document</h2>
          <p>No signed agreement matches this link. The link may be mistyped, or the document may not have been issued by Bloomwell. Please call <a href="tel:0787499988">0787499988</a> before relying on it.</p></div>
      </div>}

      {state === 'busy' && <div className={styles.error} role="alert">Too many checks from this device. Please wait a few minutes and try again.</div>}
      {state === 'error' && <div className={styles.error} role="alert">The check could not be completed right now. Please try again, or call 0787499988.</div>}

      {state === 'ok' && result && <div className={verify.stack}>
        <div className={verify.result} data-tone="good" role="status">
          <span className={verify.seal} aria-hidden="true">✓</span>
          <div><h2>This is a genuine signed agreement</h2>
            <p>Bloomwell issued and sealed this agreement. Details below are what we hold on record.</p></div>
        </div>
        {result.practice && <div className={styles.error} role="alert">Practice agreement. It has no legal effect.</div>}

        <dl className={styles.certGrid}>
          <div><dt>Reference</dt><dd>{result.reference}</dd></div>
          <div><dt>Client</dt><dd>{result.client_name}</dd></div>
          <div><dt>Client signed</dt><dd>{when(result.client_signed_at)}</dd></div>
          <div><dt>Bloomwell countersigned</dt><dd>{when(result.countersigned_at)}</dd></div>
          <div><dt>Sealed</dt><dd>{when(result.sealed_at)}</dd></div>
        </dl>

        <section className={verify.checker} aria-labelledby="check-title">
          <h2 id="check-title">Check your copy</h2>
          <p>Choose the PDF you were given. It is checked on this device only and is not uploaded.</p>
          <label className={verify.drop}>
            <input type="file" accept="application/pdf,.pdf" onChange={(e) => void onFile(e)} />
            <span className={styles.secondary}>Choose PDF to check</span>
          </label>
          {check?.state === 'match' && <div className={styles.notice} role="status"><strong>Identical.</strong> {check.name} is exactly the sealed original. It has not been changed.</div>}
          {check?.state === 'differs' && <div className={styles.error} role="alert"><strong>Different.</strong> {check.name} is not identical to the sealed original. It may have been edited, re-saved or printed to a new file. Ask Bloomwell for a fresh copy.</div>}
          {check?.state === 'error' && <div className={styles.error} role="alert">That file could not be read. Please try again.</div>}
          <small className={styles.certHash}>Original fingerprint (SHA-256): {result.pdf_sha256}</small>
          <p className={styles.security}>A paper print or screenshot cannot be file-checked. Compare its details and reference with the record above, or call us.</p>
        </section>
      </div>}
    </section>
    <footer className={styles.footer}>Questions? Call <a href="tel:0787499988">0787499988</a> or email <a href="mailto:info@bhcug.com">info@bhcug.com</a>. We show only what is needed to confirm a document is genuine.</footer>
  </main>;
}

export function VerifyAgreementPage() {
  const { reference = '', code = '' } = useParams();
  if (/^(BHC|TEST)-(INV|RCT)-\d{4}-\d{4}$/.test(reference)) {
    return <VerifyBillingPanel reference={reference} code={code} />;
  }
  return <VerifyAgreementLegacyPage />;
}
