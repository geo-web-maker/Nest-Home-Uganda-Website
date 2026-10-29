import type { ReactNode } from 'react';
import styles from './SectionHeader.module.css';

interface SectionHeaderProps {
  title: string;
  /** One line of context under the title, such as a count. */
  note?: ReactNode;
  /** A ButtonGroup or single Button for the section. */
  actions?: ReactNode;
}

/** Heading of a panel inside a page, with its actions on the right. PageHeader is for the page's own h1. */
export function SectionHeader({ title, note, actions }: SectionHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.text}>
        <h2 className={styles.title}>{title}</h2>
        {note ? <p className={styles.note}>{note}</p> : null}
      </div>
      {actions}
    </div>
  );
}
