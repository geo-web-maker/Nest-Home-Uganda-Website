import { useEffect, useState } from 'react';
import { elapsed, formatElapsed } from '../lib/time';
type Props = { startedAt: string; size?: 'sm' | 'lg'; className?: string };
export function Timer({ startedAt, size = 'sm', className = '' }: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return <p className={`mk-timer${size === 'lg' ? ' mk-timer--lg' : ''}${className ? ` ${className}` : ''}`} aria-live="off">{formatElapsed(elapsed(startedAt, now) * 1000)}</p>;
}
