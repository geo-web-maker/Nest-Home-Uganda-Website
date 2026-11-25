import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon } from './Icon';
type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> & {
  children: ReactNode;
  tone?: 'gold' | 'forest' | 'ghost' | 'danger';
  size?: 'default' | 'sm' | 'full';
  showArrow?: boolean;
};
export const PillButton = forwardRef<HTMLButtonElement, Props>(function PillButton(
  { children, tone = 'gold', size = 'default', showArrow = true, className = '', ...props },
  ref,
) {
  return <button ref={ref} className={`mk-btn mk-btn--${tone}${size === 'default' ? '' : ` mk-btn--${size}`}${showArrow ? '' : ' mk-btn--plain'}${className ? ` ${className}` : ''}`} {...props}>
    <span>{children}</span>{showArrow && <i aria-hidden="true"><Icon name="arrow" size={17} /></i>}
  </button>;
});
