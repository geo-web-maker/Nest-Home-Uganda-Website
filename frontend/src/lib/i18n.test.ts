import i18n from './i18n';

describe('i18n', () => {
  it('is ready synchronously, in English', () => {
    expect(i18n.isInitialized).toBe(true);
    expect(i18n.language).toBe('en');
  });

  it('serves common labels from the default namespace', () => {
    expect(i18n.t('nav.services')).toBe('Services');
    expect(i18n.t('actions.callNow')).toBe('Call now');
    expect(i18n.t('a11y.skipToContent')).toBe('Skip to content');
    expect(i18n.t('notFound.title')).toBe('Page not found');
  });

  it('loads the booking copy unchanged into its namespace', () => {
    expect(i18n.t('title', { ns: 'booking' })).toBe('Book a home visit');
    const bundle = i18n.getResourceBundle('en', 'booking') as { noteCount: unknown };
    expect(typeof bundle.noteCount).toBe('function');
  });

  it('has the site and admin namespaces registered', () => {
    expect(i18n.hasResourceBundle('en', 'site')).toBe(true);
    expect(i18n.hasResourceBundle('en', 'admin')).toBe(true);
  });
});
