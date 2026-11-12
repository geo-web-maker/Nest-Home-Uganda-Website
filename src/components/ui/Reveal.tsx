import type { CSSProperties, ElementType, ReactNode } from 'react';
import { useReveal } from '../../hooks/useReveal';

interface RevealProps {
  /** Element to render, so lists can keep valid markup (li, section, div). */
  as?: ElementType;
  /** Position in a group. Sets the stagger delay (70ms per step). */
  index?: number;
  className?: string;
  children: ReactNode;
}

/** Fades and lifts its children in once, when they scroll into view. */
export function Reveal({ as: Tag = 'div', index = 0, className, children }: RevealProps) {
  const ref = useReveal<HTMLElement>();
  return (
    <Tag ref={ref} className={className} style={{ '--i': index } as CSSProperties}>
      {children}
    </Tag>
  );
}
