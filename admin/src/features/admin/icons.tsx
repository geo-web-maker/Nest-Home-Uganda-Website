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
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
  agreement: <><path d="M7 3h7l5 5v13H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M14 3v5h5M9 13h7M9 17h7" /></>,
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
  // Distinct glyphs so no two sidebar entries share an icon.
  liveDashboard: <><circle cx="12" cy="12" r="3" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" /></>,
  nurse: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21a7 7 0 0 1 14 0M12 14v4M10 16h4" /></>,
  team: <><circle cx="12" cy="7" r="3" /><circle cx="5.5" cy="17" r="2.5" /><circle cx="18.5" cy="17" r="2.5" /><path d="M10 10l-3 4.5M14 10l3 4.5" /></>,
  onCall: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />,
  schedule: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  billing: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6.5 9.5v.01M17.5 14.5v.01" /></>,
  receipt: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6" />,
  map: <><path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20V6.5Z" /><path d="M9 4v13.5M15 6.5V20" /></>,
  notifyLog: <><path d="M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  careReports: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="m7 15 4-5 3 3 5-7" /></>,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" /><path d="M3.5 4v4.5H8M12 8v4.5l3 1.5" /></>,
  procedure: <><path d="M9 3h6l1 2h3v16H5V5h3l1-2Z" /><path d="m9 13 2 2 4-4" /></>,
  retention: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  sms: <><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" /><path d="M8 10h.01M12 10h.01M16 10h.01" /></>,
  catalogue: <><path d="M4 5h16M4 12h16M4 19h16" /><circle cx="8" cy="5" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="10" cy="19" r="1.5" /></>,
  dataRequest: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></>,
  backup: <><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4 4 0 0 1-.5 8.5H7Z" /><path d="M12 17v-5M9.5 14.5 12 12l2.5 2.5" /></>,
  sharedMail: <><rect x="2" y="7" width="14" height="11" rx="2" /><path d="m3 9 6 4.5L15 9" /><path d="M19 8v10a2 2 0 0 1-2 2H6" /></>,
  mailSettings: <><rect x="3" y="5" width="13" height="11" rx="2" /><path d="m4 7 5.5 4L15 7" /><circle cx="18" cy="17" r="3" /><path d="M18 13v1M18 20v1M14.5 17h1M20.5 17h1" /></>,
  clientControl: <><rect x="6" y="2.5" width="9" height="15" rx="2" /><path d="M9.5 14.5h2" /><circle cx="18" cy="17" r="3" /><path d="m16.3 18.7 3.4-3.4" /></>,
  diagnostics: <><path d="M10 3v6L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3M8.5 3h7" /><path d="M7.5 15h9" /></>,
  appCenter: <><path d="M12 3v11M7.5 10 12 14.5 16.5 10" /><path d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15" /></>,
  release: <><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="M12 8v6M9.5 11.5 12 14l2.5-2.5M10.5 18.5h3" /></>,
  permissions: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3M12 15v2" /></>,
  crossApp: <><path d="M4 8h13M13 4l4 4-4 4" /><path d="M20 16H7M11 12l-4 4 4 4" /></>,
  executive: <><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /><path d="M15 8h4v4" /></>,
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
