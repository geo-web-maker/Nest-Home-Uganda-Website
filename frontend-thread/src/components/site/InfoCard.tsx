import styles from './InfoCard.module.css';

type InfoCardProps = { label: string; value: string; href?: string };

/** Small label/value card used for supplied business contact information. */
export function InfoCard({ label, value, href }: InfoCardProps) {
  return (
    <div className={styles.card}>
      <p className={styles.label}>{label}</p>
      {href ? (
        <a className={styles.value} href={href}>
          {value}
        </a>
      ) : (
        <p className={styles.value}>{value}</p>
      )}
    </div>
  );
}
