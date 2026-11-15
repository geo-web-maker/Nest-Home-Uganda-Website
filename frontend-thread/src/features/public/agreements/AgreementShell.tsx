import { useEffect, type ReactNode } from 'react';
import { Logo } from '../../../components/brand/Logo';
import { ThemeToggle } from '../../../components/site/ThemeToggle';
import { ShapeField } from '../../../components/thread/ThreadParts';
import { cx } from '../../../lib/cx';
import styles from './AgreementShell.module.css';

const PHONE = '0787499988';
const EMAIL = 'info@bhcug.com';

type ShellProps = {
  /** Line under the brand name, for example "Client care agreement". */
  subtitle: string;
  /** Review, signing and the signed copy use the full width. The short verify step stays compact. */
  wide?: boolean;
  /** Narrow card for single-purpose screens (a link that will not open). */
  narrow?: boolean;
  footer?: ReactNode;
  children: ReactNode;
};

/**
 * Frame for every public agreement screen: Thread paper background, brand header with the theme switch,
 * a calm centred column and the contact footer. These pages hold private client data, so they ask search
 * engines not to index them (the host also sends X-Robots-Tag).
 */
export function AgreementShell({ subtitle, wide, narrow, footer, children }: ShellProps) {
  useEffect(() => {
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.appendChild(robots);
    }
    robots.content = 'noindex,nofollow';
  }, []);

  return (
    <div className={styles.page} data-wide={wide ? 'true' : undefined} data-narrow={narrow ? 'true' : undefined}>
      <ShapeField variant="page" />
      <header className={styles.header}>
        <a className={styles.home} href="/" aria-label="Bloomwell Home Care Uganda home page">
          <Logo variant="thread" name="Bloomwell" subtitle={subtitle} />
        </a>
        <ThemeToggle label="Switch between light and dark" />
      </header>
      <main className={cx(styles.main)}>{children}</main>
      <footer className={styles.footer}>
        {footer ?? (
          <>
            Questions? Call <a href={`tel:${PHONE}`}>{PHONE}</a> or email <a href={`mailto:${EMAIL}`}>{EMAIL}</a>. Your agreement remains private.
          </>
        )}
      </footer>
    </div>
  );
}
