import styles from './CheckList.module.css';

type CheckListItem = { id: string; text: string };
type CheckListProps = { items: CheckListItem[]; label: string; className?: string };

/** Accessible list with decorative diamond bullets. Copy comes from content or i18n. */
export function CheckList({ items, label, className }: CheckListProps) {
  return (
    <ul className={[styles.list, className].filter(Boolean).join(' ')} aria-label={label}>
      {items.map((item) => (
        <li className={styles.item} key={item.id}>
          <span className={styles.diamond} aria-hidden="true" />
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}
