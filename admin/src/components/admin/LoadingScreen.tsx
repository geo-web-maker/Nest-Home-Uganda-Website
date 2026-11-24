import styles from './LoadingScreen.module.css';

/** The one full-page loading state: centred spinner and a short label. Inline waits use LoadingNote. */
export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className={styles.screen} role="status" aria-busy="true">
      <span className={styles.spinner} aria-hidden="true" />
      <p className={styles.label}>{label}</p>
    </div>
  );
}
