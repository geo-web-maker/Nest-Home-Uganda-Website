import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
type Props = {
  tone: 'info' | 'warn' | 'bad' | 'ok';
  children: ReactNode;
  className?: string;
  role?: 'status' | 'alert';
  id?: string;
  /** Float above the page (a toast) so the message is seen without scrolling. Pair with onDismiss. */
  floating?: boolean;
  /** Called by the close button and, for non-error toasts, after a few seconds. */
  onDismiss?: () => void;
};
const iconFor = { info: 'info', warn: 'alert', bad: 'alert', ok: 'check' } as const;
const AUTO_DISMISS_MS = 6000;
export function Banner({ tone, children, className = '', role = 'status', id, floating = false, onDismiss }: Props) {
  useEffect(() => {
    if (!floating || !onDismiss || tone === 'bad') return undefined;
    const timer = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [floating, onDismiss, tone, children]);
  return <div id={id} className={`mk-banner mk-banner--${tone}${floating ? ' mk-banner--floating' : ''}${className ? ` ${className}` : ''}`} role={role} aria-live={role === 'alert' ? 'assertive' : 'polite'}>
    <Icon name={iconFor[tone]} size={17} /><span className="mk-banner__text">{children}</span>
    {floating && onDismiss ? <IconButton label="Dismiss message" className="mk-banner__close" onClick={onDismiss}>×</IconButton> : null}
  </div>;
}
