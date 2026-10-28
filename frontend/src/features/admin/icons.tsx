import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  enquiries: <path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z" />,
  careers: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" />
    </>
  ),
  applications: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  content: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 9v11" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" />
    </>
  ),
  reports: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </>
  ),
  // Icons used by the reference-aligned care operations navigation.
  home: <path d="M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6" />,
  pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M7 14h3M7 17h3M14 14h3" /></>,
  flag: <path d="M5 21V4m0 1c6-4 8 4 14 0v10c-6 4-8-4-14 0" />,
  bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 22h4" /></>,
  timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M9 2h6M12 2v3" /></>,
  photo: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 20" /></>,
  alert: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5M12 17h.01" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.2 2-2.1 2.1-2-1.2-.2-.1a8 8 0 0 1-2 .8l-.1.2-.5 2.2h-3l-.5-2.2-.1-.2a8 8 0 0 1-2-.8l-.2.1-2 1.2L3.9 17l1.2-2 .1-.2a8 8 0 0 1-.8-2l-.2-.1L2 12.2v-3l2.2-.5.2-.1a8 8 0 0 1 .8-2l-.1-.2-1.2-2L6 2.3l2 1.2.2.1a8 8 0 0 1 2-.8l.1-.2.5-2.2h3l.5 2.2.1.2a8 8 0 0 1 2 .8l.2-.1 2-1.2L21 4.4l-1.2 2-.1.2a8 8 0 0 1 .8 2l.2.1 2.2.5v3l-2.2.5-.2.1a8 8 0 0 1-.8 2Z" /></>,
  check: <><path d="m4 12 5 5L20 6" /><circle cx="12" cy="12" r="10" /></>,
  shield: <><path d="M12 3 20 6v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3Z" /><path d="m9 12 2 2 4-4" /></>,
  chart: <><path d="M3 3v18h18" /><rect x="6" y="12" width="3" height="6" /><rect x="11" y="8" width="3" height="10" /><rect x="16" y="5" width="3" height="13" /></>,
  signOut: <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 8l4 4-4 4M20 12H9" />,
};

/** 20px stroke icon from the nav icon keys (nav.ts) plus `more` and `signOut`. Decorative. */
export function AdminIcon({ name, className }: { name: string; className?: string }) {
  const paths = PATHS[name];
  if (!paths) return null;
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths}
    </svg>
  );
}
