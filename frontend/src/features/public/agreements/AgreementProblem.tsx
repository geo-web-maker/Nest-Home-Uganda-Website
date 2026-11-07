import { useEffect, useState } from 'react';
import { LogoMark } from '../../../components/brand/Logo';
import type { LinkFailure } from './linkFailure';
import styles from './AgreementProblem.module.css';

const PHONE = '0787499988';
const EMAIL = 'info@bhcug.com';

type Tone = 'offline' | 'link' | 'wait' | 'fault';
const TONE: Record<LinkFailure['kind'], Tone> = { network: 'offline', link: 'link', busy: 'wait', server: 'fault', unexpected: 'fault' };

function Icon({ tone }: { tone: Tone }) {
  const common = { width: 30, height: 30, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, focusable: false };
  if (tone === 'offline') return <svg {...common}><path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" /><circle cx="12" cy="19.5" r=".6" fill="currentColor" /><path d="M3 3l18 18" /></svg>;
  if (tone === 'link') return <svg {...common}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /><path d="M3 3l18 18" /></svg>;
  if (tone === 'wait') return <svg {...common}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2.5h6" /></svg>;
  return <svg {...common}><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5" /><circle cx="12" cy="18" r=".6" fill="currentColor" /></svg>;
}

/** Full-page screen for every way the agreement link can fail to open. Replaces the old plain text block. */
export function AgreementProblem({ failure }: { failure: LinkFailure }) {
  const tone = TONE[failure.kind];
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const up = () => { setOnline(true); if (failure.retry) window.location.reload(); };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, [failure.retry]);

  const copyRef = async () => {
    try { await navigator.clipboard.writeText(failure.ref); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked: the reference is still visible */ }
  };

  const [lead, ...rest] = failure.lines;
  return (
    <main className={styles.page}>
      <header className={styles.brand}>
        <span className={styles.mark}><LogoMark variant="site" /></span>
        <div><strong>Bloomwell Home Care</strong><small>Client care agreement</small></div>
      </header>

      <section className={styles.card} role="alert" aria-labelledby="problem-title" data-tone={tone}>
        <span className={styles.badge}><Icon tone={tone} /></span>
        <h1 id="problem-title">{failure.title}</h1>
        {lead && <p className={styles.lead}>{lead}</p>}
        {rest.map((line) => <p key={line} className={styles.more}>{line}</p>)}

        {!online && <p className={styles.offline}>Your phone says it is offline. This page will retry as soon as you are connected.</p>}

        {failure.kind === 'network' && (
          <ul className={styles.tips}>
            <li>Switch between Wi-Fi and mobile data</li>
            <li>Turn off data saver or a VPN, then try again</li>
          </ul>
        )}

        {failure.retry && <button type="button" className={styles.primary} onClick={() => window.location.reload()}>Try again</button>}

        <div className={styles.help}>
          <p>{failure.kind === 'link' ? 'We will gladly sort this out for you.' : 'Still not working? Reach us directly.'}</p>
          <div className={styles.actions}>
            <a className={styles.action} href={`tel:${PHONE}`}>Call {PHONE}</a>
            <a className={styles.action} href={`mailto:${EMAIL}`}>Email us</a>
          </div>
        </div>

        <div className={styles.ref}>
          <span>Reference <code>{failure.ref}</code></span>
          <button type="button" onClick={copyRef} aria-live="polite">{copied ? 'Copied' : 'Copy'}</button>
        </div>
        <p className={styles.small}>Quote this reference when you contact us. <a href="/">Bloomwell home page</a></p>
      </section>
    </main>
  );
}
