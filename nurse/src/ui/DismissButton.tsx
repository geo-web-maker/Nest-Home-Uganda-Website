import type { ButtonHTMLAttributes } from 'react';
import { Icon } from './Icon';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> & { label?: string };

/** The one close button for notices: a 36px disc with a drawn cross, inside a 44px touch area. */
export function DismissButton({ label = 'Dismiss message', className = '', type = 'button', ...props }: Props) {
  return <button type={type} className={`mk-dismiss${className ? ` ${className}` : ''}`} aria-label={label} {...props}><span className="mk-dismiss__disc" aria-hidden="true"><Icon name="close" size={16} strokeWidth={2} /></span></button>;
}
