import type { RouteRecord } from 'vite-react-ssg';
import { TeamPage } from './TeamPage';

export const teamRoute: RouteRecord = {
  path: 'team',
  Component: TeamPage,
  entry: 'src/features/public/team/TeamPage.tsx',
};
