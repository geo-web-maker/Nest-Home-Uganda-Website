import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Icon } from './Icon';

type Shared = { children: ReactNode; tone?: 'gold' | 'ghost'; variant?: 'primary' | 'outline'; size?: 'default' | 'sm' | 'full'; icon?: string; className?: string };
type Props = Shared & ({ to: LinkProps['to'] } & Omit<LinkProps, 'to' | 'className'> | ({ to?: undefined } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className'>));

/** A navigation action that looks and behaves like PillButton: same shape, height and focus ring, rendered as a real link. */
export function PillLink({ children, tone = 'ghost', variant, size = 'sm', icon, className = '', ...rest }: Props) {
  const resolved = variant ? (variant === 'primary' ? 'gold' : 'ghost') : tone;
  const cls = `mk-btn mk-btn--${resolved} mk-btn--plain${size === 'default' ? '' : ` mk-btn--${size}`}${className ? ` ${className}` : ''}`;
  const inner = <>{icon ? <Icon name={icon} size={17} /> : null}<span>{children}</span></>;
  if ('to' in rest && rest.to !== undefined) return <Link className={cls} {...(rest as LinkProps)}>{inner}</Link>;
  return <a className={cls} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>{inner}</a>;
}
