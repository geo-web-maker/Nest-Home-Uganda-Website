import { useEffect, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, apiClient } from '../../../lib/api/client';
import { LogoMark } from '../../../components/brand/Logo';
import { sha256Hex } from '../verify/hash';
import styles from '../agreements/AgreementPublicPage.module.css';
import verify from '../agreements/VerifyAgreementPage.module.css';

type BillingVerified = {
  valid: true;
  status: 'valid' | 'void';
  superseded: boolean;
  doc_type: 'invoice' | 'receipt';
  reference: string;
  practice: boolean;
  issued_on: string;
  amount_ugx: number;
  client_name: string;
  voided_at: string | null;
  content_hash: string;
  pdf_sha256: { ledger: string; slip: string };
};
type Check = { state: 'match' | 'differs' | 'error'; name: string } | null;
const when = (value?: string | null) => (value ? new Date(value).toLocaleDateString() : '-');
const money = (value: number) => `UGX ${value.toLocaleString('en-UG')}`;

export function VerifyBillingPanel({ reference, code }: { reference: string; code: string }) {
  const { t } = useTranslation('site');
  const [result, setResult] = useState<BillingVerified | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'notfound' | 'busy' | 'error'>('loading');
  const [check, setCheck] = useState<Check>(null);

  useEffect(() => {
    document.title = t('billingVerify.documentTitle');
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.appendChild(robots);
    }
    robots.content = 'noindex,nofollow';
    let live = true;
    apiClient
      .get<BillingVerified>(
        `/public/billing/verify/${encodeURIComponent(reference)}/${encodeURIComponent(code)}`,
      )
      .then((data) => {
        if (live) {
          setResult(data);
          setState('ok');
        }
      })
      .catch((cause) => {
        if (!live) return;
        setState(
          cause instanceof ApiError
            ? cause.status === 404
              ? 'notfound'
              : cause.status === 429
                ? 'busy'
                : 'error'
            : 'error',
        );
      });
    return () => {
      live = false;
    };
  }, [reference, code, t]);

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !result) return;
    try {
      const hash = await sha256Hex(file);
      setCheck({
        state: Object.values(result.pdf_sha256).includes(hash) ? 'match' : 'differs',
        name: file.name,
      });
    } catch {
      setCheck({ state: 'error', name: file.name });
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.brand}>
        <span className={styles.brandMark}>
          <LogoMark variant="site" />
        </span>
        <div>
          <strong>{t('brand.name')}</strong>
          <small>{t('billingVerify.brandSubtitle')}</small>
        </div>
      </header>
      <section className={styles.card}>
        <p className={styles.eyebrow}>{t('billingVerify.eyebrow')}</p>
        <h1>{t('billingVerify.title')}</h1>
        {state === 'loading' && <p role="status">{t('billingVerify.loading')}</p>}
        {state === 'notfound' && (
          <div className={verify.result} data-tone="neutral" role="alert">
            <span className={verify.seal}>!</span>
            <div>
              <h2>{t('billingVerify.notFoundTitle')}</h2>
              <p>{t('billingVerify.notFoundMessage')}</p>
            </div>
          </div>
        )}
        {state === 'busy' && (
          <div className={styles.error} role="alert">
            {t('billingVerify.busy')}
          </div>
        )}
        {state === 'error' && (
          <div className={styles.error} role="alert">
            {t('billingVerify.error')}
          </div>
        )}
        {state === 'ok' && result && (
          <div className={verify.stack}>
            <div
              className={verify.result}
              data-tone={result.status === 'void' ? 'bad' : 'good'}
              role="status"
            >
              <span className={verify.seal}>{result.status === 'void' ? '!' : '✓'}</span>
              <div>
                <h2>
                  {t(
                    result.status === 'void'
                      ? 'billingVerify.genuineVoidTitle'
                      : 'billingVerify.genuineValidTitle',
                  )}
                </h2>
                <p>
                  {result.status === 'void'
                    ? t('billingVerify.voidMessage', { date: when(result.voided_at) })
                    : t('billingVerify.validMessage')}
                </p>
              </div>
            </div>
            {result.practice && (
              <div className={styles.error} role="alert">
                {t('billingVerify.practice')}
              </div>
            )}
            {result.superseded && (
              <div className={styles.error} role="alert">
                {t('billingVerify.superseded')}
              </div>
            )}
            <dl className={styles.certGrid}>
              <div>
                <dt>{t('billingVerify.documentType')}</dt>
                <dd>
                  {t(
                    result.doc_type === 'invoice'
                      ? 'billingVerify.invoice'
                      : 'billingVerify.receipt',
                  )}
                </dd>
              </div>
              <div>
                <dt>{t('billingVerify.reference')}</dt>
                <dd>{result.reference}</dd>
              </div>
              <div>
                <dt>{t('billingVerify.date')}</dt>
                <dd>{when(result.issued_on)}</dd>
              </div>
              <div>
                <dt>{t('billingVerify.amount')}</dt>
                <dd>{money(result.amount_ugx)}</dd>
              </div>
              <div>
                <dt>{t('billingVerify.client')}</dt>
                <dd>{result.client_name}</dd>
              </div>
              {result.status === 'void' && (
                <div>
                  <dt>{t('billingVerify.voided')}</dt>
                  <dd>{when(result.voided_at)}</dd>
                </div>
              )}
            </dl>
            <section className={verify.checker} aria-labelledby="billing-check-title">
              <h2 id="billing-check-title">{t('billingVerify.checkCopy')}</h2>
              <p>{t('billingVerify.chooseCopy')}</p>
              <label className={verify.drop}>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(event) => void onFile(event)}
                />
                <span className={styles.secondary}>{t('billingVerify.choosePdf')}</span>
              </label>
              {check?.state === 'match' && (
                <div className={styles.notice} role="status">
                  <strong>{t('billingVerify.identical')}</strong>{' '}
                  {t('billingVerify.matches', { name: check.name })}
                </div>
              )}
              {check?.state === 'differs' && (
                <div className={styles.error} role="alert">
                  <strong>{t('billingVerify.different')}</strong>{' '}
                  {t('billingVerify.differs', { name: check.name })}
                </div>
              )}
              {check?.state === 'error' && (
                <div className={styles.error} role="alert">
                  {t('billingVerify.fileError')}
                </div>
              )}
              <small className={styles.certHash}>
                {t('billingVerify.snapshotHash', { hash: result.content_hash })}
              </small>
              <small className={styles.certHash}>
                {t('billingVerify.ledgerHash', { hash: result.pdf_sha256.ledger })}
              </small>
              <small className={styles.certHash}>
                {t('billingVerify.slipHash', { hash: result.pdf_sha256.slip })}
              </small>
            </section>
          </div>
        )}
      </section>
      <footer className={styles.footer}>{t('billingVerify.footer')}</footer>
    </main>
  );
}
