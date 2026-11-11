import type { RouteRecord } from 'vite-react-ssg';
import { ArticlePage } from './ArticlePage';
import { FaqPage } from './FaqPage';

export const faqRoute: RouteRecord = {
  path: 'faq',
  Component: FaqPage,
  entry: 'src/features/public/faq/FaqPage.tsx',
};
export const articleRoute: RouteRecord = {
  path: 'faq/:slug',
  Component: ArticlePage,
  entry: 'src/features/public/faq/ArticlePage.tsx',
};
