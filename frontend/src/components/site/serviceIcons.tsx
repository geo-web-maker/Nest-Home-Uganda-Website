import type { ReactNode } from 'react';

const STROKE = {
  stroke: '#E9C46A',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  fill: 'none',
} as const;

const PHYSIOTHERAPY = (
  <>
    <circle cx="20" cy="8.5" r="3.5" {...STROKE} />
    <path d="M20 13v12M11 17l9-2 9 2M20 25l-6 10M20 25l6 10" {...STROKE} />
  </>
);

const PALLIATIVE = (
  <path d="M20 34C8 25 6 17 11 12.5c4-3 8-1 9 2 1-3 5-5 9-2C34 17 32 25 20 34z" {...STROKE} />
);

const PEDIATRIC = (
  <>
    <circle cx="20" cy="21" r="11" {...STROKE} />
    <path d="M15 11c2-4 8-4 10 0M16 24c2 2.5 6 2.5 8 0" {...STROKE} />
    <circle cx="16" cy="19" r="0.9" fill="#E9C46A" />
    <circle cx="24" cy="19" r="0.9" fill="#E9C46A" />
  </>
);

const HOSPITAL_TO_HOME = <path d="M5 20L20 7l15 13M9 17v17h22V17M17 34v-9h6v9" {...STROKE} />;

/** Icon tiles for services without a photo. Keyed by `icon_key`, with the slug as a fallback key. */
const ICONS: Record<string, ReactNode> = {
  physiotherapy: PHYSIOTHERAPY,
  'physiotherapy-at-home': PHYSIOTHERAPY,
  palliative: PALLIATIVE,
  'palliative-respite-care': PALLIATIVE,
  pediatric: PEDIATRIC,
  'pediatric-home-nursing': PEDIATRIC,
  'hospital-to-home': HOSPITAL_TO_HOME,
};

/** A decorative line icon, or null when the service has no icon in the map. */
export function serviceIcon(iconKey: string | null, slug: string): ReactNode {
  const glyph = (iconKey ? ICONS[iconKey] : undefined) ?? ICONS[slug];
  if (!glyph) return null;
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      {glyph}
    </svg>
  );
}
