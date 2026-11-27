import type { ComponentProps } from 'react';
import type { NurseRouteViews } from './routes';
import { LoginScreen } from '../screens/LoginScreen';
import { SetPasswordScreen } from '../screens/SetPasswordScreen';
import { TodayScreen } from '../screens/TodayScreen';
import { Onboarding } from '../screens/Onboarding';
import { HistoryScreen } from '../screens/HistoryScreen';
import { TimesheetsScreen } from '../features/timesheets/TimesheetsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { DocumentsScreen } from '../features/careforms/DocumentsScreen';
import { MailScreen } from '../features/mail/MailScreen';
import { AuditScreen } from '../screens/AuditScreen';
import { AppCenterScreen } from '../screens/AppCenterScreen';
import { SyncScreen } from '../screens/SyncScreen';

type PrimaryRouteKeys = Exclude<keyof NurseRouteViews, 'visit' | 'activeVisit'>;
export type PrimaryRouteViewInputs = {
  login: ComponentProps<typeof LoginScreen>;
  today: ComponentProps<typeof TodayScreen>;
  onboarding: ComponentProps<typeof Onboarding>;
  history: ComponentProps<typeof HistoryScreen>;
  timesheets: ComponentProps<typeof TimesheetsScreen>;
  profile: ComponentProps<typeof ProfileScreen>;
  sync: ComponentProps<typeof SyncScreen>;
};

/** Composes the stable screen routes separately from session, sync and visit-action logic. */
export function createPrimaryRouteViews(inputs: PrimaryRouteViewInputs): Pick<NurseRouteViews, PrimaryRouteKeys> {
  return {
    setPassword: <SetPasswordScreen />,
    login: <LoginScreen {...inputs.login} />,
    today: <TodayScreen {...inputs.today} />,
    onboarding: <Onboarding {...inputs.onboarding} />,
    history: <HistoryScreen {...inputs.history} />,
    timesheets: <TimesheetsScreen {...inputs.timesheets} />,
    profile: <ProfileScreen {...inputs.profile} />,
    documents: <DocumentsScreen />,
    mail: <MailScreen />,
    audit: <AuditScreen />,
    appCenter: <AppCenterScreen />,
    sync: <SyncScreen {...inputs.sync} />,
  };
}
