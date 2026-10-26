import { CareScreenRouter } from './care/CareScreenPage';
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
  '/admin/reports': ReportsPage,
  '/admin/care': CareScreenRouter,
};

/** Title only. No copy is invented for screens that are not built yet. */
export function AdminPlaceholder({ item }: { item: AdminNavItem }) {
  const { t } = useTranslation('admin');
  return <h1>{t(`nav.${item.labelKey}`)}</h1>;
}
