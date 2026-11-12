import styles from './MapPlaceholder.module.css';

type MapPlaceholderProps = { label: string; description?: string };

/** Accessible map slot. No map provider or location pin is invented here. */
export function MapPlaceholder({ label, description }: MapPlaceholderProps) {
  return (
    <div className={styles.placeholder} role="img" aria-label={label}>
      <p>{label}</p>
      {description && <span>{description}</span>}
    </div>
  );
}
