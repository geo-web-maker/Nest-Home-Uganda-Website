type Props = { initials: string; className?: string; label?: string };
export function Avatar({ initials, className = '', label }: Props) {
  return <span className={`mk-avatar${className ? ` ${className}` : ''}`} role="img" aria-label={label || `Profile initials ${initials}`}>{initials}</span>;
}
