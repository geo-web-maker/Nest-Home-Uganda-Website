import styles from './PriceCard.module.css';

type PriceCardProps = { tag: string; title: string; text: string; featured?: boolean };

/** Pricing approach card. Prices and wording are always supplied by content. */
export function PriceCard({ tag, title, text, featured = false }: PriceCardProps) {
  return (
    <article className={`${styles.card} ${featured ? styles.featured : ''}`}>
      <p className={styles.tag}>{tag}</p>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.text}>{text}</p>
    </article>
  );
}
