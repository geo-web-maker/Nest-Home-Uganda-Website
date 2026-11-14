import type { ReactNode } from 'react';
import { ButtonSizeProvider } from '../ui/Button';
import type { ButtonSize } from '../ui/Button';
import { cx } from '../../lib/cx';
import styles from './ButtonGroup.module.css';

interface ButtonGroupProps {
  children: ReactNode;
  /** `compact` for actions inside a table row or card, `control` for form and dialog footers. */
  size?: Extract<ButtonSize, 'control' | 'compact'>;
  align?: 'start' | 'end';
  /** Adds space above, for a footer under a form. */
  spaced?: boolean;
  className?: string;
}

/** A row of related buttons with one gap, one size and one wrapping rule. */
export function ButtonGroup({ children, size = 'control', align = 'start', spaced = false, className }: ButtonGroupProps) {
  return (
    <div className={cx(styles.group, align === 'end' && styles.end, spaced && styles.spaced, className)}>
      <ButtonSizeProvider value={size}>{children}</ButtonSizeProvider>
    </div>
  );
}
