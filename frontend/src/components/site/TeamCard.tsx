import styles from './TeamCard.module.css';

type TeamCardProps = {
  name: string;
  role: string;
  photoUrl?: string | null;
  photoAlt?: string;
  placeholderLabel: string;
};

/** Team portrait card. Registration data must never be passed to this component. */
export function TeamCard({ name, role, photoUrl, photoAlt, placeholderLabel }: TeamCardProps) {
  return (
    <article className={styles.card}>
      <div className={styles.photoFrame}>
        {photoUrl ? (
          <img
            className={styles.photo}
            src={photoUrl}
            alt={photoAlt ?? `${name}, ${role}`}
            loading="lazy"
          />
        ) : (
          <span className={styles.placeholder} aria-label={placeholderLabel}>
            {placeholderLabel}
          </span>
        )}
      </div>
      <h3 className={styles.name}>{name}</h3>
      <p className={styles.role}>{role}</p>
    </article>
  );
}
