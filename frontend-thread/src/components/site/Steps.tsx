import styles from './Steps.module.css';

export type StepItem = { id: string; number: string; title: string; text: string };
type StepsProps = { items: StepItem[]; label: string };

/** Responsive numbered process steps, with content provided by the page. */
export function Steps({ items, label }: StepsProps) {
  return (
    <ol className={styles.steps} aria-label={label}>
      {items.map((item, index) => (
        <li className={styles.step} key={item.id}>
          <span className={styles.number} aria-hidden="true">
            {item.number}
          </span>
          <div className={styles.body}>
            <h3 className={styles.title}>{item.title}</h3>
            <p className={styles.text}>{item.text}</p>
          </div>
          {index < items.length - 1 && <span className={styles.connector} aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}
