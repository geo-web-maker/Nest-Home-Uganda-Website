import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import styles from './Chip.module.css';

type CareChipProps = {
  variant?: 'care';
  selected: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
};

type AreaChipProps = {
  variant: 'area';
  className?: string;
  children: ReactNode;
};

export type ChipProps = CareChipProps | AreaChipProps;

/**
 * Care chip: multi-select toggle button (booking form).
 * Area chip: static label (areas page).
 */
export function Chip(props: ChipProps) {
  if (props.variant === 'area') {
    return <span className={cx(styles.chip, styles.area, props.className)}>{props.children}</span>;
  }
  const { selected, onToggle, disabled, className, children } = props;
  return (
    <button
      type="button"
      className={cx(styles.chip, styles.care, className)}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onToggle}
    >
      {children}
    </button>
  );
}
