import type { RouteRecord } from 'vite-react-ssg';
import { PrivacyPage } from './PrivacyPage';
export const privacyRoute: RouteRecord = {
  path: 'privacy',
  Component: PrivacyPage,
  entry: 'src/features/public/privacy/PrivacyPage.tsx',
};
