import { CareScreenRouter } from './care/CareScreenPage';
import { VisitSchedulePage } from './care/VisitSchedulePage';
import { VisitPhotosPage } from './care/VisitListAndPhotosPages';
import { FlagsQueuePage, MyTeamPage } from './care/FlagsAndTeamPages';
import { AlertsPage, TimesheetsPage } from './care/AlertAndTimesheetPages';
import { CareExecutiveDashboardPage, CareLiveDashboardPage } from './care/CareDashboardPages';
import { LastSeenMapPage } from './care/LastSeenMapPage';
import { NotificationLogPage, SmsSettingsPage } from './care/NotificationAndSmsPages';
import { OnCallRosterPage, SOSConsolePage, SOSHistoryPage, SOSProcedurePage } from './care/SafetyAndSetupPages';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityPage } from './activity';
import { ApplicationsPage } from './applications';
import { ContentPage } from './content';
import { DashboardPage } from './dashboard';
import { EnquiriesPage } from './enquiries';
import { JobsPage } from './jobs';
import { ReportsPage } from './reports';
import { SettingsPage } from './settings';
import { UsersPage } from './users';
import type { AdminNavItem } from './nav';
import { AppReleasesPage, BackupsHealthPage, PermissionsPage, CareSettingCataloguePage, DataRetentionPage } from './GovernancePages';

/**
 * Admin screens by nav path. A screen that is not listed here shows the placeholder below.
 * Each screen job adds its list screen here.
 */
export const adminScreens: Partial<Record<string, ComponentType>> = {
  '/admin': DashboardPage,
  '/admin/activity': ActivityPage,
  '/admin/enquiries': EnquiriesPage,
  '/admin/careers': JobsPage,
  '/admin/applications': ApplicationsPage,
  '/admin/content': ContentPage,
  '/admin/settings': SettingsPage,
  '/admin/users': UsersPage,
  '/admin/permissions': PermissionsPage,
  '/admin/app-releases': AppReleasesPage,
  '/admin/backups': BackupsHealthPage,
  '/admin/care/setting-catalogue': CareSettingCataloguePage,
  '/admin/care/data-retention': DataRetentionPage,
  '/admin/reports': ReportsPage,
  '/admin/care/clients': CareScreenRouter,
  '/admin/care/places': CareScreenRouter,
  '/admin/care/nurses': CareScreenRouter,
  '/admin/care/visits': CareScreenRouter,
  '/admin/care/schedule': VisitSchedulePage,
  '/admin/care/flags': FlagsQueuePage,
  '/admin/care/team': MyTeamPage,
  '/admin/care/dashboard': CareLiveDashboardPage,
  '/admin/care/executive': CareExecutiveDashboardPage,
  '/admin/care/map': LastSeenMapPage,
  '/admin/care/alerts': AlertsPage,
  '/admin/care/timesheets': TimesheetsPage,
  '/admin/care/photos': VisitPhotosPage,
  '/admin/care/notifications': NotificationLogPage,
  '/admin/care/reports/visits': CareScreenRouter,
  '/admin/care/sos': SOSConsolePage,
  '/admin/care/sos/history': SOSHistoryPage,
  '/admin/care/on-call': OnCallRosterPage,
  '/admin/care/sos-procedure': SOSProcedurePage,
  '/admin/care/sms': SmsSettingsPage,
  '/admin/care/settings': CareScreenRouter,
  '/admin/care/readiness': CareScreenRouter,
  '/admin/care/data-requests': CareScreenRouter,
};

/** Title only. No copy is invented for screens that are not built yet. */
export function AdminPlaceholder({ item }: { item: AdminNavItem }) {
  const { t } = useTranslation('admin');
  return <h1>{t(`nav.${item.labelKey}`)}</h1>;
}
