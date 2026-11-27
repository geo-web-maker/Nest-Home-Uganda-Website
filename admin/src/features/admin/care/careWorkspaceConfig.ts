export type CareTab =
  | 'nurses'
  | 'clients'
  | 'visits'
  | 'places'
  | 'flags'
  | 'team'
  | 'photos'
  | 'alerts'
  | 'timesheets'
  | 'sos'
  | 'reports'
  | 'settings'
  | 'readiness'
  | 'data';

export const CARE_TABS: readonly CareTab[] = [
  'nurses', 'clients', 'visits', 'places', 'flags', 'team', 'photos',
  'alerts', 'timesheets', 'sos', 'reports', 'settings', 'readiness', 'data',
];

export const CARE_TAB_LABELS: Record<CareTab, string> = {
  nurses: 'Nurses',
  clients: 'Clients',
  visits: 'Visits',
  places: 'Places',
  flags: 'Flags',
  team: 'Team',
  photos: 'Photo review',
  alerts: 'Alerts',
  timesheets: 'Timesheets',
  sos: 'SOS cases',
  reports: 'Visit reports',
  settings: 'Settings',
  readiness: 'Readiness',
  data: 'Data and retention',
};

export const CARE_TABS_WITH_ACTIONS: readonly CareTab[] = [
  'visits', 'flags', 'photos', 'alerts', 'timesheets', 'sos',
];
