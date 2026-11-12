import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import styles from './Accordion.module.css';

export interface AccordionItem {
  id: string;
  summary: ReactNode;
  content: ReactNode;
}

interface AccordionProps {
  items: AccordionItem[];
  className?: string;
}

/** FAQ rows built on native details and summary, so it works without scripts. */
export function Accordion({ items, className }: AccordionProps) {
  return (
    <div className={cx(styles.accordion, className)}>
      {items.map((item) => (
        <details key={item.id} className={styles.row}>
          <summary className={styles.summary}>{item.summary}</summary>
          <div className={styles.answer}>{item.content}</div>
        </details>
      ))}
    </div>
  );
}
