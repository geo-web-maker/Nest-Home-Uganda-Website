import { cx } from '../../lib/cx';
import styles from './Logo.module.css';

export type LogoVariant = 'site' | 'admin';

interface LogoProps {
  /** Business name, for example from site settings. */
  name: string;
  /** Line under the name. */
  subtitle: string;
  variant?: LogoVariant;
  className?: string;
}

const SIZES: Record<LogoVariant, { width: number; height: number }> = {
  site: { width: 36, height: 30 },
  admin: { width: 30, height: 26 },
};

/** The nest mark. Decorative: the text beside it names the logo. */
export function LogoMark({ variant = 'site' }: { variant?: LogoVariant }) {
  const { width, height } = SIZES[variant];
  return (
    <svg
      viewBox="0 0 40 34"
      width={width}
      height={height}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20 1v6M17 4h6" stroke="#C79A3B" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="14" cy="16" rx="5" ry="6.5" fill="#E9DDB8" />
      <ellipse cx="22" cy="14.5" rx="5" ry="6.5" fill="#F4F1DF" />
      <ellipse cx="29" cy="17" rx="4.5" ry="6" fill="#E9DDB8" />
      <path
        d={
          variant === 'admin'
            ? 'M3 21c4 11 30 11 34 0'
            : 'M3 21c4 11 30 11 34 0M6 23c6 7 22 7 28 0M10 26c5 4 15 4 20 0'
        }
        stroke="#C79A3B"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Mark plus name and subtitle. Never place it on a gold background. */
export function Logo({ name, subtitle, variant = 'site', className }: LogoProps) {
  return (
    <span className={cx(styles.logo, variant === 'admin' && styles.admin, className)}>
      <LogoMark variant={variant} />
      <span className={styles.text}>
        {name}
        <small className={styles.sub}>{subtitle}</small>
      </span>
    </span>
  );
}
