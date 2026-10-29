import type { ReactNode } from 'react';
import { Button } from '../../../../components/ui/Button';

/** Consistent side-sheet wrapper for record details and secondary workflows. */
export function CareSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <aside className="care-detail" aria-labelledby="care-sheet-title">
      <header className="care-sheet-header">
        <h2 id="care-sheet-title">{title}</h2>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </header>
      {children}
    </aside>
  );
}
