import type { RouteRecord } from 'vite-react-ssg';
import { ContactPage } from './ContactPage';

export const contactRoute: RouteRecord = {
  path: 'contact',
  Component: ContactPage,
  entry: 'src/features/public/contact/ContactPage.tsx',
};
