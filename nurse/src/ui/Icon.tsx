import type { SVGProps } from 'react';

const paths: Record<string, string[]> = {
  today: ['M4 5h16v15H4z', 'M8 3v4', 'M16 3v4', 'M4 10h16', 'M8 14h3'],
  hist: ['M3 12a9 9 0 1 0 2.64-6.36', 'M3 4v5h5', 'M12 7v5l3 2'],
  doc: ['M6 3h9l4 4v14H6z', 'M14 3v5h5', 'M9 12h7', 'M9 16h7'],
  user: ['M20 21a8 8 0 0 0-16 0', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8'],
  pin: ['M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z', 'M12 10a2.5 2.5 0 1 0 0-.01'],
  sync: ['M20 7v5h-5', 'M4 17v-5h5', 'M5.6 9A7 7 0 0 1 18 6l2 1', 'M4 17l2 1a7 7 0 0 0 12.4-3'],
  arrow: ['M5 12h14', 'm13 6 6 6-6 6'],
  'arrow-left': ['M19 12H5', 'm11 18-6-6 6-6'],
  'arrow-up-right': ['M7 17 17 7', 'M7 7h10v10'],
  check: ['m5 12 4 4L19 6'],
  clock: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 6v6l4 2'],
  alert: ['M12 3 2.8 20h18.4L12 3Z', 'M12 9v4', 'M12 17h.01'],
  camera: ['M4 7h3l1.5-2h7L17 7h3v12H4z', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'],
  plus: ['M12 5v14', 'M5 12h14'],
  moon: ['M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z'],
  sun: ['M12 3v2', 'M12 19v2', 'M3 12h2', 'M19 12h2', 'm5.64 5.64 1.42 1.42', 'm16.94 16.94 1.42 1.42', 'm18.36 5.64-1.42 1.42', 'm7.06 16.94-1.42 1.42', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'],
  info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 11v5', 'M12 7h.01'],
  close: ['m6 6 12 12', 'M18 6 6 18'],
  map: ['m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z', 'M9 3v15', 'M15 6v15'],
};

type Props = SVGProps<SVGSVGElement> & { name: keyof typeof paths | string; size?: number };

export function Icon({ name, size = 20, ...props }: Props) {
  const segments = paths[name] ?? paths.info;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {segments.map((d, index) => <path d={d} key={`${name}-${index}`} />)}
    </svg>
  );
}
