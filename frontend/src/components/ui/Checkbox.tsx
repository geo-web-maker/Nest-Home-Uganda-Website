import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx';
import styles from './Checkbox.module.css';

type CheckboxProps = {
  /** Text next to the box. Always required: a checkbox without a name is not accessible. */
  label: ReactNode;
  /** Keeps the label for screen readers but hides it, for a box that sits inside a row of other controls. */
  hideLabel?: boolean;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className' | 'children'>;

/**
 * One checkbox with its label. The whole row is the click target and is at least 44px tall.
 * The ref goes to the input, so it works with react-hook-form `register`.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, hideLabel, className, ...rest },
  ref,
) {
  return (
    <label className={cx(styles.check, className)}>
      <input ref={ref} {...rest} type='checkbox' className={styles.input} />
      <span className={cx(styles.text, hideLabel && styles.hidden)}>{label}</span>
    </label>
  );
});
