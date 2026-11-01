type Props = { title: string; subtitle?: string; className?: string };
export function MapPlaceholder({ title, subtitle, className = '' }: Props) {
  return <div className={`mk-map${className ? ` ${className}` : ''}`} role="img" aria-label={`${title}${subtitle ? `: ${subtitle}` : ''}`}>
    <span>{title}</span>{subtitle && <small>{subtitle}</small>}
  </div>;
}
