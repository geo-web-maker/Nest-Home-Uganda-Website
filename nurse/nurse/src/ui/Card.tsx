import type { HTMLAttributes, ReactNode } from 'react';
type Props = HTMLAttributes<HTMLElement> & { children: ReactNode; hot?: boolean; innerClassName?: string };
export function Card({ children, hot = false, className = '', innerClassName = '', ...props }: Props) {
  return <article className={`mk-card${hot ? ' mk-card--hot' : ''}${className ? ` ${className}` : ''}`} {...props}>
    <div className={`mk-card__in${innerClassName ? ` ${innerClassName}` : ''}`}>{children}</div>
  </article>;
}
