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
import { AgreementsPage } from './agreements/AgreementsPage';
import { BillingPage } from './billing/BillingPage';
import { MailPage } from './mail/MailPage';
import { MailSettingsPage } from './mail/MailSettingsPage';
import { SharedMailboxesPage } from './mail/SharedMailboxesPage';
import { ApplicationsPage } from './applications';
import { ContentPage } from './content';
import { DashboardPage } from './dashboard';
import { EnquiriesPage } from './enquiries';
import { JobsPage } from './jobs';
import { ReportsPage } from './reports';
import { SettingsPage } from './settings';
import { UsersPage } from './users';
import { DiagnosticsPage } from './diagnostics/DiagnosticsPage';
import type { AdminNavItem } from './nav';
import { AppReleasesPage, BackupsHealthPage, PermissionsPage, CareSettingCataloguePage, DataRetentionPage } from './GovernancePages';

/**
 * Admin screens by nav path. A screen that is not listed here shows the placeholder below.
 * Each screen job adds its list screen here.
 */
export const adminScreens: Partial<Record<string, ComponentType>> = {
  '': DashboardPage,
  '/mail': MailPage,
  '/agreements': AgreementsPage,
  '/billing': BillingPage,
  '/billing/receipts': BillingPage,
  '/mail/shared': SharedMailboxesPage,
  '/mail/settings': MailSettingsPage,
  '/diagnostics': DiagnosticsPage,
  '/activity': ActivityPage,
  '/enquiries': EnquiriesPage,
  '/careers': JobsPage,
  '/applications': ApplicationsPage,
  '/content': ContentPage,
  '/settings': SettingsPage,
  '/users': UsersPage,
  '/permissions': PermissionsPage,
  '/app-releases': AppReleasesPage,
  '/backups': BackupsHealthPage,
  '/care/setting-catalogue': CareSettingCataloguePage,
  '/care/data-retention': DataRetentionPage,
  '/reports': ReportsPage,
  '/care/clients': CareScreenRouter,
  '/care/places': CareScreenRouter,
  '/care/nurses': CareScreenRouter,
  '/care/visits': CareScreenRouter,
  '/care/schedule': VisitSchedulePage,
  '/care/flags': FlagsQueuePage,
  '/care/team': MyTeamPage,
  '/care/dashboard': CareLiveDashboardPage,
  '/care/executive': CareExecutiveDashboardPage,
  '/care/map': LastSeenMapPage,
  '/care/alerts': AlertsPage,
  '/care/timesheets': TimesheetsPage,
  '/care/photos': VisitPhotosPage,
  '/care/notifications': NotificationLogPage,
  '/care/reports/visits': CareScreenRouter,
  '/care/sos': SOSConsolePage,
  '/care/sos/history': SOSHistoryPage,
  '/care/on-call': OnCallRosterPage,
  '/care/sos-procedure': SOSProcedurePage,
  '/care/sms': SmsSettingsPage,
  '/care/settings': CareScreenRouter,
  '/care/readiness': CareScreenRouter,
  '/care/data-requests': CareScreenRouter,
};

/** Title only. No copy is invented for screens that are not built yet. */
export function AdminPlaceholder({ item }: { item: AdminNavItem }) {
  const { t } = useTranslation('admin');
  return <h1>{t(`nav.${item.labelKey}`)}</h1>;
}
