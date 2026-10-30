import type { ReactNode } from 'react';
export type ChipKind = 'ok' | 'rv' | 'pd' | 'pg' | 'sc' | 'new' | 'bad';
type Props = { kind: ChipKind; children: ReactNode; className?: string };
export function Chip({ kind, children, className = '' }: Props) {
  return <span className={`mk-chip mk-chip--${kind} ${className}`.trim()}>{children}</span>;
}
