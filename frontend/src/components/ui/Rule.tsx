import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import shapes from '../../design/shapes.module.css';
import styles from './Rule.module.css';

interface RuleProps {
  children: ReactNode;
  /** Centre the row, for centred sections. */
  centered?: boolean;
  className?: string;
}

/** Section label: gold line, uppercase text, small diamond. */
export function Rule({ children, centered = false, className }: RuleProps) {
  return (
    <div className={cx(styles.rule, centered && styles.centered, className)}>
      <span className={styles.line} aria-hidden="true" />
      <span>{children}</span>
      <span className={shapes.diamond} aria-hidden="true" />
    </div>
  );
}
