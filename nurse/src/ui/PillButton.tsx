import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon } from './Icon';
type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> & {
  children: ReactNode;
  tone?: 'gold' | 'forest' | 'ghost' | 'danger';
  size?: 'default' | 'sm' | 'full';
  showArrow?: boolean;
};
export function PillButton({ children, tone = 'gold', size = 'default', showArrow = true, className = '', ...props }: Props) {
  return <button className={`mk-btn mk-btn--${tone}${size === 'default' ? '' : ` mk-btn--${size}`}${className ? ` ${className}` : ''}`} {...props}>
    <span>{children}</span>{showArrow && <i aria-hidden="true"><Icon name="arrow" size={17} /></i>}
  </button>;
}
