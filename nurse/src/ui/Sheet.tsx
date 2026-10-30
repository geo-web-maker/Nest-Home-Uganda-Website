import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** id of the heading that names the dialog. */
  labelledBy: string;
  describedBy?: string;
  /** `alertdialog` for confirmations that need an explicit answer. */
  role?: 'dialog' | 'alertdialog';
  /** `bottom` is the phone bottom sheet; `center` is a centred modal (photo viewer, confirmations) stacked above other sheets. */
  placement?: 'bottom' | 'center';
  /** Draws the grab handle. Defaults to on for bottom sheets. */
  handle?: boolean;
  className?: string;
  backdropClassName?: string;
};

/** The single modal-sheet construction: backdrop, optional handle and the dialog surface. */
export function Sheet({ children, labelledBy, describedBy, role = 'dialog', placement = 'bottom', handle, className = '', backdropClassName = '' }: Props) {
  const showHandle = handle ?? placement === 'bottom';
  return <div className={`sheet-backdrop${placement === 'center' ? ' sheet-backdrop--center' : ''}${backdropClassName ? ` ${backdropClassName}` : ''}`} role="presentation">
    <section className={`sheet${placement === 'center' ? ' sheet--center' : ''}${className ? ` ${className}` : ''}`} role={role} aria-modal="true" aria-labelledby={labelledBy} aria-describedby={describedBy}>
      {showHandle && <div className="sheet-handle" aria-hidden="true" />}
      {children}
    </section>
  </div>;
}

/** Footer row for a sheet's buttons. */
export function SheetActions({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`sheet-actions${className ? ` ${className}` : ''}`}>{children}</div>;
}
