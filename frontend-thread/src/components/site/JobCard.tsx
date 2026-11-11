import { Button } from '../ui/Button';
import styles from './JobCard.module.css';

type JobCardProps = {
  title: string;
  location: string;
  type: string;
  href: string;
  applyLabel: string;
  closesOn?: string | null;
  closingLabel?: string;
};

/** Public job summary with an explicit route and caller-supplied labels. */
export function JobCard({
  title,
  location,
  type,
  href,
  applyLabel,
  closesOn,
  closingLabel,
}: JobCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.content}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.meta}>{[location, type].filter(Boolean).join(' · ')}</p>
        {closesOn && closingLabel && (
          <p className={styles.meta}>
            {closingLabel}: {closesOn}
          </p>
        )}
      </div>
      <Button href={href} variant="outline" className={styles.apply}>
        {applyLabel}
      </Button>
    </article>
  );
}
