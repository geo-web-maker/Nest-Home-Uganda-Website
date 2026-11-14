import { cx } from '../../lib/cx';
import { MARK_CROSS, MARK_LEAVES, MARK_PETALS, MARK_VIEWBOX } from './markPaths';
import styles from './Logo.module.css';

export type LogoVariant = 'site' | 'admin' | 'thread';

interface LogoProps {
  /** Business name, for example from site settings. */
  name: string;
  /** Line under the name. */
  subtitle: string;
  variant?: LogoVariant;
  className?: string;
}

const SIZES: Record<LogoVariant, { width: number; height: number }> = {
  site: { width: 32, height: 35 },
  admin: { width: 26, height: 29 },
  thread: { width: 32, height: 35 },
};

/** The Bloomwell mark. Decorative: the text beside it names the logo. */
export function LogoMark({ variant = 'site' }: { variant?: LogoVariant }) {
  const { width, height } = SIZES[variant];
  return (
    <svg
      className={styles.mark}
      viewBox={MARK_VIEWBOX}
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
    >
      <path className={styles.leaf} d={MARK_LEAVES} />
      <path className={styles.leaf} d={MARK_CROSS} />
      {MARK_PETALS.map((petal) => (
        <path key={petal.fill} fill={petal.fill} d={petal.d} />
      ))}
    </svg>
  );
}

/** Mark plus name and subtitle. Never place it on a gold or orange background. */
export function Logo({ name, subtitle, variant = 'site', className }: LogoProps) {
  if (variant === 'thread') {
    return (
      <span className={cx(styles.thread, className)}>
        <LogoMark variant="thread" />
        <span className={styles.threadName}>
          {name}
          <small className={styles.threadSub}>{subtitle}</small>
        </span>
      </span>
    );
  }
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

/** Fixed-colour mark for sign-in cards, so it stays visible in light and dark. */
export function LoginMark() {
  return (
    <svg viewBox={MARK_VIEWBOX} width="48" height="53" aria-hidden="true" focusable="false">
      <path fill="#08675F" d={MARK_LEAVES} />
      <path fill="#08675F" d={MARK_CROSS} />
      {MARK_PETALS.map((petal) => (
        <path key={petal.fill} fill={petal.fill} d={petal.d} />
      ))}
    </svg>
  );
}
