import { useId, type ReactNode } from 'react';
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
  const headingId = useId();
  return (
    <aside className="care-detail" aria-labelledby={headingId}>
      <header className="care-sheet-header">
        <h2 id={headingId}>{title}</h2>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </header>
      {children}
    </aside>
  );
}
