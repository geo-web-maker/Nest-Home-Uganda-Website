import { Button } from '../ui/Button';
import styles from './Pagination.module.css';

export interface PaginationLabels {
  /** Accessible name of the nav, for example "Pages". */
  nav: string;
  previous: string;
  next: string;
  /** Text such as "1 to 25 of 60". */
  summary: (from: number, to: number, total: number) => string;
}

interface PaginationProps {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  labels: PaginationLabels;
}

/** Previous and Next with a range summary. Renders nothing for an empty list. */
export function Pagination({ page, pageSize, total, onChange, labels }: PaginationProps) {
  if (total <= 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  return (
    <nav aria-label={labels.nav} className={styles.pagination}>
      <p className={styles.summary}>{labels.summary(from, to, total)}</p>
      {pages > 1 && (
        <div className={styles.buttons}>
          <Button variant="outline" disabled={current <= 1} onClick={() => onChange(current - 1)}>
            {labels.previous}
          </Button>
          <Button
            variant="outline"
            disabled={current >= pages}
            onClick={() => onChange(current + 1)}
          >
            {labels.next}
          </Button>
        </div>
      )}
    </nav>
  );
}
