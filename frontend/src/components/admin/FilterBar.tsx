import type { FormEvent, ReactNode } from 'react';
import { ButtonSizeProvider } from '../ui/Button';
import { cx } from '../../lib/cx';
import styles from './FilterBar.module.css';

/** Class for a Field that should take twice the room of its siblings, such as a search box. */
export const filterBarGrow = styles.grow;

interface FilterBarProps {
  /** Accessible name for the group of filters. */
  label: string;
  /** Fields (and selects). Each is laid out as an equal column. */
  children: ReactNode;
  /** Buttons for the bar. They share the fields' bottom edge. */
  actions?: ReactNode;
  /** Plain text shown at the end of the row, such as "12 visits shown". */
  meta?: ReactNode;
  /** With a handler the bar is a <form>, so Enter submits and a `type="submit"` button works. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  /** Draws the bar as a card. */
  framed?: boolean;
  /** `search` marks a bar whose main control searches the page. */
  role?: 'search' | 'group';
  className?: string;
}

/**
 * The one filter row for admin pages: fields on a shared baseline with their buttons.
 * Use this instead of a page-made flex/grid so a button never drifts below the inputs.
 */
export function FilterBar({
  label,
  children,
  actions,
  meta,
  onSubmit,
  framed = false,
  role = 'group',
  className,
}: FilterBarProps) {
  const classes = cx(styles.bar, framed && styles.framed, className);
  const content = (
    <>
      {children}
      {actions ? (
        <div className={styles.actions}>
          <ButtonSizeProvider value="control">{actions}</ButtonSizeProvider>
        </div>
      ) : null}
      {meta ? <p className={styles.meta}>{meta}</p> : null}
    </>
  );

  if (onSubmit) {
    return (
      <form
        role={role}
        aria-label={label}
        className={classes}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(event);
        }}
      >
        {content}
      </form>
    );
  }
  return (
    <div role={role} aria-label={label} className={classes}>
      {content}
    </div>
  );
}
