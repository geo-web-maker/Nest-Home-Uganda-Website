import { useState } from 'react';
import { useConnectionStatus, type StatusLevel } from './connectionStatus';
import styles from './ConnectionDot.module.css';

const LABEL: Record<StatusLevel, string> = { ok: 'Online', issue: 'Online, with issues', offline: 'Offline' };

/** Messenger-style status dot: green = online, orange = online but something needs attention, red = offline. */
export function ConnectionDot() {
  const { level, message } = useConnectionStatus();
  const [open, setOpen] = useState(false);
  const text = message || 'Online. Everything is saved.';
  return (
    <span className={`${styles.wrap} ${styles[level]}`}>
      <button type="button" className={styles.button} aria-label={`Connection: ${LABEL[level]}`} aria-expanded={open}
        onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)}>
        <span className={styles.dot} />
      </button>
      {open && <span role="status" className={styles.pop}><strong>{LABEL[level]}.</strong> {message ? text : 'Everything is saved.'}</span>}
    </span>
  );
}
