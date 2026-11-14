import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './ConfirmPopup.module.css';

interface ConfirmPopupProps {
  /** Id of the heading inside `children`; names the dialog for screen readers. */
  labelledBy: string;
  /** Escape and a click on the dim backdrop call this (the safe choice, never "send"). */
  onDismiss: () => void;
  children: ReactNode;
}

/**
 * A real popup for confirmations raised from the compose window: it is drawn over the whole page
 * (portal to <body>), centred in the viewport, with a dimmed backdrop, so it can never sit
 * out of sight at the bottom of the scrolling compose window.
 */
export function ConfirmPopup({ labelledBy, onDismiss, children }: ConfirmPopupProps) {
  const box = useRef<HTMLElement>(null);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelector<HTMLElement>('button:not([disabled])');
    (first ?? box.current)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        dismiss.current();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss.current();
      }}
    >
      <section
        ref={box}
        tabIndex={-1}
        className={`mr-send-confirm ${styles.popup}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}
