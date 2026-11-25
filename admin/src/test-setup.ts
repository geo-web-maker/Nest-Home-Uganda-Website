import '@testing-library/jest-dom/vitest';
import '@shared/lib/i18n';

// Pages read site settings through one hook. Keep its test default local: importing the real query module
// here would import apiClient before individual test mocks are installed, making their API methods real
// functions instead of vi.fn() mocks. queries.test.tsx explicitly loads the real hook with vi.importActual.
vi.mock('@shared/lib/queries/site', () => {
  const DEFAULT_SITE = {
    business: { phone: '0787 499 988', whatsapp: '256787499988', office: 'Kampala, Uganda' },
  };
  return {
    DEFAULT_SITE,
    siteKey: ['site'],
    useSiteSettings: () => ({ data: DEFAULT_SITE }),
  };
});

// jsdom has no layout, so it does not implement elementFromPoint. ProseMirror calls it on mousedown, which
// made the mail compose tests throw uncaught errors even though every assertion passed.
if (typeof document.elementFromPoint !== 'function') {
  document.elementFromPoint = () => null;
}
