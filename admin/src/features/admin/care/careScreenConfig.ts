export type ScreenKey =
  | 'nurses'
  | 'clients'
  | 'places'
  | 'visits'
  | 'flags'
  | 'team'
  | 'photos'
  | 'alerts'
  | 'timesheets'
  | 'sos'
  | 'reports'
  | 'settings'
  | 'readiness'
  | 'data'
  | 'audit';
export const CARE_SCREEN_PATHS: Record<ScreenKey, string> = {
  nurses: 'nurses',
  clients: 'clients',
  places: 'places',
  visits: 'visits',
  flags: 'flags',
  team: 'team',
  photos: 'photos',
  alerts: 'alerts',
  timesheets: 'timesheets',
  sos: 'sos',
  reports: 'reports/visits',
  settings: 'settings',
  readiness: 'readiness',
  data: 'data-requests',
  audit: 'audit',
};
export const CARE_SCREEN_SCOPES: Record<ScreenKey, string[]> = {
  nurses: ['nurses:read'],
  clients: ['clients:read'],
  places: ['places:read'],
  visits: ['visits:read'],
  flags: ['flags:read'],
  team: ['visits:read'],
  photos: ['photos:read'],
  alerts: ['alerts:read'],
  timesheets: ['timesheets:read'],
  sos: ['alerts:read'],
  reports: ['care-reports:read'],
  settings: ['carecfg:read'],
  readiness: ['carecfg:read'],
  data: ['system:manage'],
  audit: ['activity:read'],
};
export const endpoint: Record<ScreenKey, string> = {
  nurses: '/admin/care/nurses',
  clients: '/admin/care/clients',
  places: '/admin/care/clients',
  visits: '/admin/care/visits',
  flags: '/admin/care/flags',
  team: '/admin/care/team',
  photos: '/admin/care/photos',
  alerts: '/admin/care/alerts',
  timesheets: '/admin/care/timesheets',
  sos: '/admin/care/sos',
  reports: '/admin/care/reports/visits',
  settings: '/admin/care/settings',
  readiness: '/admin/care/readiness',
  data: '/admin/care/data-requests',
  audit: '/admin/activity',
};
export const titles: Record<ScreenKey, string> = {
  nurses: 'Nurses',
  clients: 'Clients',
  places: 'Places & stays',
  visits: 'Visit schedule & review',
  flags: 'Flags queue',
  team: 'Team status',
  photos: 'Photo review',
  alerts: 'Alerts dashboard',
  timesheets: 'Timesheets',
  sos: 'SOS & on-call',
  reports: 'Care reports',
  settings: 'Care settings',
  readiness: 'Care readiness',
  data: 'Data requests',
  audit: 'Audit history',
};
