import { useConnectionStatus, type StatusLevel } from './connectionStatus';
import styles from './AvatarStatusDot.module.css';

const LABEL: Record<StatusLevel, string> = { ok: 'Online', issue: 'Online, with issues', offline: 'Offline' };

/** Messenger-style status dot: sits on the bottom-right corner of the profile circle. Green = online, orange = needs attention, red = offline. */
export function AvatarStatusDot() {
  const { level } = useConnectionStatus();
  return <span className={`${styles.dot} ${styles[level]}`} role="img" aria-label={LABEL[level]} title={LABEL[level]} />;
}
