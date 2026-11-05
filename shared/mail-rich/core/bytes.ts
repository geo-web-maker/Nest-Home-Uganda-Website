const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), UNITS.length - 1);
  const amount = value / 1024 ** unit;
  const text = amount >= 10 || unit === 0 ? amount.toFixed(0) : amount.toFixed(1).replace(/\.0$/, '');
  return `${text} ${UNITS[unit]}`;
}
