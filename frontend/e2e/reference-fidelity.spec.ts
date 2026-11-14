import { expect, test } from '@playwright/test';
import { json, mockApi } from './helpers';

const PUBLIC_HEADER_LINKS = ['Home', 'How it works', 'FAQ', 'Contact'];
const ABOUT_MENU_LINKS = ['About', 'Team', 'Areas', 'Careers'];

test.describe('public website vs reference mockup', () => {
  test('desktop primary navigation follows the canonical page order', async ({ page }) => {
    await mockApi(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main' });
    const primaryLabels = await nav.locator(':scope > ul > li').evaluateAll((items) =>
      items.map((item) => item.querySelector('a, button')?.textContent?.trim() ?? ''),
    );
    expect(primaryLabels).toEqual(['Home', 'Services', 'How it works', 'About', 'FAQ', 'Contact']);
    for (const label of PUBLIC_HEADER_LINKS) {
      await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
    }
    const servicesMenu = nav.getByRole('button', { name: 'Services' });
    await expect(servicesMenu).toBeVisible();
    await servicesMenu.click();
    await expect(nav.getByRole('link', { name: 'Services', exact: true })).toBeVisible();
    const aboutMenu = nav.getByRole('button', { name: 'About', exact: true });
    await expect(aboutMenu).toBeVisible();
    await aboutMenu.click();
    await expect(aboutMenu).toHaveAttribute('aria-expanded', 'true');
    await expect(servicesMenu).toHaveAttribute('aria-expanded', 'false');
    for (const label of ABOUT_MENU_LINKS) {
      await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
    }
    const footer = page.locator('footer');
    const explore = footer.getByRole('navigation', { name: 'Explore' });
    const company = footer.getByRole('navigation', { name: 'Company' });
    await expect(explore).toBeVisible();
    expect(await explore.getByRole('link').allTextContents()).toEqual([
      'Services', 'How it works', 'Contact',
    ]);
    expect(await company.getByRole('link').allTextContents()).toEqual([
      'Our team', 'Areas we serve', 'FAQ and care tips', 'About us', 'Careers', 'Privacy and terms', 'Staff login',
    ]);
  });

  test('phone/tablet menu stays collapsible and all primary destinations remain reachable', async ({ page }) => {
    await mockApi(page);
    for (const width of [320, 390, 820]) {
      await page.setViewportSize({ width, height: 850 });
      await page.goto('/');
      const menuButton = page.locator('header button[aria-controls="site-nav"]');
      await expect(menuButton).toBeVisible();
      await menuButton.click();
      const nav = page.getByRole('navigation', { name: 'Main' });
      await expect(nav.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'FAQ', exact: true })).toBeVisible();
      await nav.getByRole('button', { name: 'About', exact: true }).click();
      for (const label of ABOUT_MENU_LINKS) {
        await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
      }
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
    }
  });

  test('the homepage preserves the reference section structure and palette under dark OS preference', async ({ page }) => {
    await mockApi(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Care that comes home');
    await expect(page.getByRole('heading', { level: 2, name: /eight kinds of care/i })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /home-based care|trusted|promise/i }).first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /from first call to first visit/i })).toBeVisible();
    const tokens = await page.evaluate(() => ({
      background: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      scheme: getComputedStyle(document.documentElement).colorScheme,
    }));
    expect(tokens.background).toBe('#F2F8F6');
    expect(tokens.scheme).toBe('light');
  });

  for (const width of [320, 390, 820, 1280]) {
    test(`the reference page registry renders the intended headlines without horizontal overflow at ${width}px`, async ({ page }) => {
      const referenceArticle = {
        id: 'reference-care-guide', slug: 'care-guide', title: 'Care guide',
        body: 'A short practical guide for families arranging care at home.',
        image_media_id: null, published_at: '2026-10-01T09:00:00Z',
      };
      const referenceJob = {
        id: 'abc', title: 'Registered Nurse', department: 'clinical', location: 'Kampala',
        type: 'full_time', description: 'Provide safe, compassionate home nursing.',
        requirements: 'Registered with the relevant professional council.',
        closes_on: null, registration_required: true,
      };
      const referenceJobs = [
        referenceJob,
        { ...referenceJob, id: 'midwife', title: 'Midwife', type: 'part_time' },
        {
          ...referenceJob, id: 'caregiver', title: 'Caregiver and Companion', department: 'care',
          type: 'contract', registration_required: false,
        },
      ];
      const referenceService = {
        id: 'service-elder-care', slug: 'elder-care', name: 'Elder care',
        summary: 'Daily support for older adults at home.', number: 1, icon_key: null,
        photo_media_id: null, hero_label: 'Elder care',
        hero_headline: 'Care for older adults at home.',
        hero_lead: 'Respectful everyday support for older people and their families.',
        facts: ['Home visits', 'Kampala and surrounds'],
        who_for: ['Older adults who need practical daily support'],
        includes: ['Personal care', 'Companionship'], how_often: 'As agreed in the care plan.',
        seo_title: 'Elder care at home', seo_description: 'Home elder care.', related: [],
      };
      await mockApi(page, {
        'GET /api/v1/public/services/elder-care': (route) => json(200, referenceService)(route),
        'GET /api/v1/public/faqs': (route) => json(200, [])(route),
        'GET /api/v1/public/articles': (route) => json(200, [referenceArticle])(route),
        'GET /api/v1/public/articles/care-guide': (route) => json(200, referenceArticle)(route),
        'GET /api/v1/public/jobs': (route) => json(200, referenceJobs)(route),
        'GET /api/v1/public/jobs/abc': (route) => json(200, referenceJob)(route),
      });
      const pages = [
        { path: '/', heading: 'Care that comes home to you' },
        { path: '/services', heading: 'Eight kinds of care, one trusted team' },
        { path: '/services/elder-care', heading: 'Care for older adults at home' },
        { path: '/about', heading: 'Care that treats your family as ours' },
        { path: '/how-it-works', heading: 'Clear steps, clear pricing' },
        { path: '/team', heading: 'Faces you can trust at your door' },
        { path: '/areas', heading: 'Home visits across Kampala and surrounds' },
        { path: '/faq', heading: 'Answers to common questions' },
        { path: '/faq/care-guide', heading: 'Care guide' },
        { path: '/contact', heading: 'Talk to us today' },
        { path: '/privacy', heading: 'Privacy and terms' },
        { path: '/careers', heading: 'Join the team' },
        { path: '/careers/abc', heading: 'Registered Nurse' },
      ];
      await page.setViewportSize({ width, height: 900 });
      for (const destination of pages) {
        await page.goto(destination.path);
        await expect(page.getByRole('main')).toBeVisible();
        await expect(page.getByRole('heading', { level: 1 })).toContainText(destination.heading);
        if (destination.path === '/careers') {
          for (const role of ['Registered Nurse', 'Midwife', 'Caregiver and Companion']) {
            await expect(page.getByRole('heading', { level: 3, name: role })).toBeVisible();
          }
          const roleGrid = page.getByRole('main').locator('ul').first();
          const columns = await roleGrid.evaluate((element) =>
            getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length,
          );
          expect(columns, `career role grid columns at ${width}px`).toBe(width >= 1040 ? 3 : width >= 700 ? 2 : 1);
        }
        const dimensions = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          content: document.documentElement.scrollWidth,
        }));
        expect(dimensions.content, `${destination.path} overflows at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
      }
    });
  }
});

