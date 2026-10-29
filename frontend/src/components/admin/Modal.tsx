import { useEffect, useRef, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { Button } from '../ui/Button';
import styles from './Modal.module.css';

interface ModalProps {
  /** Unique id for the heading; the dialog is named by it. */
  id: string;
  title: ReactNode;
  /** Line under the title, for example what the dialog is about. */
  subtitle?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  className?: string;
  children: ReactNode;
}

/** The one admin dialog: backdrop, heading, Close button, Escape to close, focus moves inside. */
export function Modal({ id, title, subtitle, onClose, closeLabel = 'Close', className, children }: ModalProps) {
  const dialog = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <div className={styles.backdrop}>
      <section
        ref={dialog}
        tabIndex={-1}
        className={cx(styles.modal, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
      >
        <header className={styles.header}>
          <div>
            <h2 id={id}>{title}</h2>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
          <Button variant="outline" onClick={onClose}>
            {closeLabel}
          </Button>
        </header>
        {children}
      </section>
    </div>
  );
}
