import type { RouteRecord } from 'vite-react-ssg';
import { HowItWorksPage } from './HowItWorksPage';

export const howItWorksRoute: RouteRecord = {
  path: 'how-it-works',
  Component: HowItWorksPage,
  entry: 'src/features/public/how-it-works/HowItWorksPage.tsx',
};
