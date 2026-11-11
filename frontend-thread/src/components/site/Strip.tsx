import styles from './Strip.module.css';

type StripProps = { text?: string; items?: string[]; label?: string };

/** Gold information band for one admin-controlled message or a short fact list. */
export function Strip({ text, items, label }: StripProps) {
  const values = items ?? [];
  return (
    <div className={styles.strip} aria-label={label}>
      {text ? (
        <p>{text}</p>
      ) : (
        <ul>
          {values.map((item, index) => (
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
