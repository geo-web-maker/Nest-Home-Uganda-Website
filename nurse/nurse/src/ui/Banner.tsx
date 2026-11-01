import type { ReactNode } from 'react';
import { Icon } from './Icon';
type Props = { tone: 'info' | 'warn' | 'bad' | 'ok'; children: ReactNode; className?: string; role?: 'status' | 'alert' };
const iconFor = { info: 'info', warn: 'alert', bad: 'alert', ok: 'check' } as const;
export function Banner({ tone, children, className = '', role = 'status' }: Props) {
  return <div className={`mk-banner mk-banner--${tone}${className ? ` ${className}` : ''}`} role={role} aria-live={role === 'alert' ? 'assertive' : 'polite'}>
    <Icon name={iconFor[tone]} size={17} /><span>{children}</span>
  </div>;
}
