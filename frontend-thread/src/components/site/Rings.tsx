import styles from './Rings.module.css';

export type RingItem = { id: string; title: string; text: string };

type RingsProps = { items: RingItem[]; label: string; className?: string };

/** Three circular statements, with all copy supplied by the caller. */
export function Rings({ items, label, className }: RingsProps) {
  return (
    <ul className={[styles.rings, className].filter(Boolean).join(' ')} aria-label={label}>
      {items.map((item) => (
        <li className={styles.ring} key={item.id}>
          <div className={styles.content}>
            <h3 className={styles.title}>{item.title}</h3>
            <p className={styles.text}>{item.text}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
