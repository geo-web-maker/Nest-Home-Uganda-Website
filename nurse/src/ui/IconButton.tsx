import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  /** Accessible name; icon-only buttons have no visible text. */
  label: string;
  children: ReactNode;
  tone?: 'plain' | 'accent';
};

/** Round 44px icon-only button. */
export function IconButton({ label, children, tone = 'plain', className = '', type = 'button', ...props }: Props) {
  return <button type={type} className={`mk-icon-button${tone === 'accent' ? ' mk-icon-button--accent' : ''}${className ? ` ${className}` : ''}`} aria-label={label} {...props}>{children}</button>;
}
