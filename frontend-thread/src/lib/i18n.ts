import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { adminEn } from '../locales/en/admin';
import { bookingCopyEn } from '../locales/en/booking';
import { commonEn } from '../locales/en/common';
import { siteEn } from '../locales/en/site';

export const NAMESPACES = ['common', 'booking', 'site', 'admin'] as const;

// English only, no detector, no backend, resources bundled: init is synchronous, so
// pre-render (vite-react-ssg) and tests see translated text on the first render.
void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: ['en'],
  ns: [...NAMESPACES],
  defaultNS: 'common',
  initAsync: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
  resources: {
    en: { common: commonEn, booking: bookingCopyEn, site: siteEn, admin: adminEn },
  },
});

export default i18n;
