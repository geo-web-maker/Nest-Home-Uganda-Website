import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon } from './Icon';

type Tone = 'gold' | 'forest' | 'ghost' | 'danger';
/** Same vocabulary as the shared Button in admin and the public site, so one name means one look everywhere. */
export type PillVariant = 'primary' | 'outline' | 'forest' | 'danger';
const VARIANT_TONE: Record<PillVariant, Tone> = { primary: 'gold', outline: 'ghost', forest: 'forest', danger: 'danger' };

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> & {
  children: ReactNode;
  tone?: Tone;
  /** Shared-Button spelling of `tone`. Wins over `tone` when both are given. */
  variant?: PillVariant;
  size?: 'default' | 'sm' | 'full';
  showArrow?: boolean;
  /** Shows the spinner, sets aria-busy and blocks clicks while work is in flight (same contract as the shared Button). */
  loading?: boolean;
};
export const PillButton = forwardRef<HTMLButtonElement, Props>(function PillButton(
  { children, tone = 'gold', variant, size = 'default', showArrow = true, loading = false, disabled, className = '', ...props },
  ref,
) {
  const resolved = variant ? VARIANT_TONE[variant] : tone;
  return <button ref={ref} className={`mk-btn mk-btn--${resolved}${size === 'default' ? '' : ` mk-btn--${size}`}${showArrow ? '' : ' mk-btn--plain'}${className ? ` ${className}` : ''}`} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
    <span>{loading && <span className="mk-spinner" aria-hidden="true" />}{children}</span>{showArrow && <i aria-hidden="true"><Icon name="arrow" size={17} /></i>}
  </button>;
});
