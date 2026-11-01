import type { ReactNode } from 'react';
type Props = { icon?: ReactNode; label?: string; value?: ReactNode; children?: ReactNode; className?: string };
export function Row({ icon, label, value, children, className = '' }: Props) {
  return <div className={`mk-row${className ? ` ${className}` : ''}`}>
    {icon && <span className="mk-row__icon" aria-hidden="true">{icon}</span>}
    <span className="mk-row__main">{label && <span className="mk-row__label">{label}</span>}{value !== undefined && <span className="mk-row__value">{value}</span>}{children}</span>
  </div>;
}
