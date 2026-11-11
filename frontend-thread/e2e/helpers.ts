import type { Page } from '@playwright/test';

const serviceCard = {
  id: 'service-1', number: 1, name: 'Elderly care', slug: 'elderly-care',
  summary: 'Practical and compassionate support at home.', icon_key: 'home', photo_media_id: null,
};
const serviceDetail = {
  ...serviceCard,
  hero_label: 'Care at home', hero_headline: 'Support for older people at home',
  hero_lead: 'A published service description from the API fixture.',
  facts: ['Home visits'], who_for: ['Older adults'], includes: ['Daily living support'],
  how_often: 'As agreed in the care plan.', seo_title: 'Elderly care',
  seo_description: 'Home care support.', related: [],
};
const article = {
  id: 'article-1', slug: 'care-at-home', title: 'Preparing for care at home',
  body: 'A sample article body for route and accessibility checks.', image_media_id: null,
  published_at: '2026-01-01T00:00:00Z',
};
const job = {
  id: 'nurse-role', title: 'Registered nurse', department: 'clinical', location: 'Kampala',
  type: 'full_time', description: 'A sample role description for route checks.',
  requirements: 'Current professional registration\nHome-care experience',
  closes_on: null, registration_required: true,
};

/** API fixtures exercise the real page components without requiring a database in browser tests. */
export async function mockPublicApi(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith('/public/site')) {
      data = {
        business: { phone: '0787 499 988', whatsapp: '256787499988', office: 'Kampala, Uganda', hours: 'Monday to Saturday' },
        home: { show_team: true, show_testimonials: false, location_strip: 'Home visits across Kampala' },
        forms: { open_whatsapp_after: false },
      };
    } else if (path.endsWith('/public/services/elderly-care')) {
      data = serviceDetail;
    } else if (path.endsWith('/public/services')) {
      data = [serviceCard];
    } else if (path.endsWith('/public/faqs')) {
      data = [{ id: 'faq-1', question: 'How does a home visit work?', answer: 'The team discusses your needs and agrees the next step.', service_id: 'service-1', sort_order: 1 }];
    } else if (path.endsWith('/public/articles/care-at-home')) {
      data = article;
    } else if (path.endsWith('/public/articles')) {
      data = [article];
    } else if (path.endsWith('/public/jobs/nurse-role')) {
      data = job;
    } else if (path.endsWith('/public/jobs')) {
      data = [job];
    } else if (path.endsWith('/public/pages/privacy')) {
      data = { id: 'privacy', key: 'privacy', title: 'Privacy and terms', body: 'Privacy details will be supplied by the client.' };
    } else if (path.endsWith('/public/pages/about_story')) {
      data = { id: 'about_story', key: 'about_story', title: 'Our story', body: 'Our story content is supplied by the client.' };
    } else if (path.endsWith('/public/pages/about_credentials')) {
      data = { id: 'about_credentials', key: 'about_credentials', title: 'Credentials', body: 'Credentials content is supplied by the client.' };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
}
