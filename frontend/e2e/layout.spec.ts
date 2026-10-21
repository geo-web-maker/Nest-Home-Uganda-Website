import { expect, test, type Page } from '@playwright/test';
import { json, mockApi } from './helpers';

/**
 * Layout and structure guard. Runs every public page at phone, tablet and desktop widths and fails on:
 *  - sideways page scroll
 *  - text that spills outside the box it is drawn in (the "Compassionate" ring bug)
 *  - text pushed past the screen edge
 *  - broken page structure (h1 count, landmarks, heading order, images without alt)
 *
 * Motion is turned off so the checks see the final layout. Add data-layout-ignore to an element
 * (or any ancestor) to exempt something that overflows on purpose.
 */

const ROUTES = [
  '/',
  '/services',
  '/about',
  '/team',
  '/how-it-works',
  '/areas',
  '/faq',
  '/careers',
  '/contact',
  '/privacy',
];

const VIEWPORTS = [
  { width: 320, height: 640 },
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

// The viewport is set per test, so run once on the desktop project instead of once per project.
test.skip(({ isMobile }) => isMobile, 'viewports are set inside this spec');

// Realistic and deliberately awkward content (long names, long words) so cards and lists are laid out
// with data in them, not just empty states.
const LONG = 'Compassionate Intergenerational Rehabilitation';
const MOCK = {
  'GET /api/v1/public/team': json(
    200,
    ['Nakato Namukasa-Kiggundu', 'Dr. Ssebunya Muwanguzi', 'Atuhaire Byaruhanga', 'Wanjiru K.'].map(
      (name, index) => ({
        id: `t${index}`,
        name,
        role: 'Registered General Nurse',
        qualification: 'Bachelor of Science in Nursing',
        photo_media_id: null,
      }),
    ),
  ),
  'GET /api/v1/public/areas': json(
    200,
    ['Kampala Central', 'Ntinda', 'Bugolobi', 'Kyambogo University Surroundings', 'Entebbe'].map(
      (name, index) => ({ id: `a${index}`, name, sort_order: index, aliases: [] }),
    ),
  ),
  'GET /api/v1/public/services': json(
    200,
    [
      LONG,
      'Elder care',
      'Newborn care',
      'Post-surgery recovery',
      'Physiotherapy',
      'Palliative care',
    ].map((name, index) => ({
      id: `s${index}`,
      slug: `service-${index}`,
      name,
      summary: 'Daily support for older adults, delivered at home by vetted nurses.',
      number: index + 1,
      icon_key: null,
      photo_media_id: null,
    })),
  ),
  'GET /api/v1/public/jobs': json(200, [
    {
      id: 'j1',
      title: 'Registered Nurse (Home Visits, Kampala and Wakiso)',
      department: 'clinical',
      location: 'Kampala',
      type: 'full_time',
      description: 'Visit patients at home.',
      requirements: 'Diploma in nursing\nValid licence',
      closes_on: null,
      registration_required: true,
    },
  ]),
  'GET /api/v1/public/faqs': json(
    200,
    [0, 1, 2].map((index) => ({
      id: `f${index}`,
      question: 'How quickly can a nurse start visiting after we book an assessment?',
      answer: 'Usually within two days.',
      service_id: null,
      sort_order: index,
    })),
  ),
  'GET /api/v1/public/pricing': json(
    200,
    (['assessment', 'quote', 'plan'] as const).map((key, index) => ({
      id: `p${index}`,
      key,
      tag: 'Step',
      title: 'Free home assessment',
      text: 'We visit, listen and agree a plan with you.',
      price_text: 'UGX 0',
      sort_order: index,
    })),
  ),
};

async function load(page: Page, path: string, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockApi(page, MOCK);
  await page.goto(path);
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

for (const { width, height } of VIEWPORTS) {
  for (const path of ROUTES) {
    test(`layout ${path} at ${width}px`, async ({ page }) => {
      await load(page, path, width, height);

      const problems = await page.evaluate(() => {
        const found: string[] = [];
        const name = (el: Element) => {
          const id = el.id ? `#${el.id}` : '';
          const cls =
            typeof el.className === 'string' && el.className
              ? `.${el.className.trim().split(/\s+/)[0]}`
              : '';
          return `${el.tagName.toLowerCase()}${id}${cls}`;
        };
        const ignored = (el: Element) => el.closest('[data-layout-ignore]') !== null;
        // True when an ancestor (up to stop) clips or scrolls its content on purpose.
        const clipped = (el: Element, stop: Element | null) => {
          for (let node: Element | null = el; node && node !== stop; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (style.overflowX !== 'visible' || style.textOverflow === 'ellipsis') return true;
          }
          return false;
        };
        const painted = (el: Element) => {
          const style = getComputedStyle(el);
          const bg = style.backgroundColor;
          const hasBg = bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
          const hasBorder =
            parseFloat(style.borderLeftWidth) > 0 || parseFloat(style.borderRightWidth) > 0;
          return hasBg || hasBorder || style.backgroundImage !== 'none';
        };

        // 1. Sideways page scroll.
        const root = document.documentElement;
        if (root.scrollWidth > root.clientWidth + 1) {
          found.push(
            `page scrolls sideways (${root.scrollWidth}px content in ${root.clientWidth}px screen)`,
          );
        }

        // 2 and 3. Walk every visible text node.
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const seen = new Set<string>();
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent?.trim();
          const parent = node.parentElement;
          if (!text || !parent || ignored(parent)) continue;
          if (parent.closest('script, style, noscript')) continue;
          if (!parent.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;

          const range = document.createRange();
          range.selectNodeContents(node);
          const rect = range.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;

          // Text past the screen edge, unless it sits in a scroller or clipped box.
          if ((rect.right > window.innerWidth + 1 || rect.left < -1) && !clipped(parent, null)) {
            const key = `edge:${name(parent)}:${text.slice(0, 20)}`;
            if (!seen.has(key)) {
              seen.add(key);
              found.push(`text runs off the screen: "${text.slice(0, 40)}" in ${name(parent)}`);
            }
            continue;
          }

          // Text outside the nearest visibly drawn box (border or background).
          let box: Element | null = parent;
          while (box && box !== document.body && !painted(box)) box = box.parentElement;
          if (!box || box === document.body || box === document.documentElement) continue;
          if (clipped(parent, box.parentElement)) continue;
          const boxRect = box.getBoundingClientRect();
          if (rect.left < boxRect.left - 1 || rect.right > boxRect.right + 1) {
            const key = `box:${name(box)}:${text.slice(0, 20)}`;
            if (!seen.has(key)) {
              seen.add(key);
              found.push(
                `text spills out of its box: "${text.slice(0, 40)}" (${Math.round(rect.width)}px wide) in ${name(box)} (${Math.round(boxRect.width)}px wide)`,
              );
            }
          }
        }

        // 4. The page container sits dead centre: same gap left and right.
        const screenWidth = document.documentElement.clientWidth;
        for (const el of Array.from(document.querySelectorAll('[class*="container"]'))) {
          if (ignored(el) || !el.checkVisibility()) continue;
          const r = el.getBoundingClientRect();
          const left = r.left;
          const right = screenWidth - r.right;
          if (Math.abs(left - right) > 1.5) {
            found.push(
              `${name(el)} is off-centre: ${Math.round(left)}px left, ${Math.round(right)}px right`,
            );
            break;
          }
        }

        // 5. Cards and tiles in the same row are the same width and the same height.
        for (const grid of Array.from(document.querySelectorAll('main *, footer *'))) {
          if (ignored(grid) || getComputedStyle(grid).display !== 'grid') continue;
          const kids = Array.from(grid.children).filter(
            (kid): kid is HTMLElement => kid instanceof HTMLElement && kid.checkVisibility(),
          );
          if (kids.length < 2) continue;
          const signature = (kid: HTMLElement) => `${kid.tagName}.${kid.className}`;
          const same = kids.every((kid) => signature(kid) === signature(kids[0] as HTMLElement));
          if (!same) continue; // unlike children (e.g. a text column and an image) are not meant to match
          const rows = new Map<number, HTMLElement[]>();
          for (const kid of kids) {
            const row = rows.get(kid.offsetTop) ?? [];
            row.push(kid);
            rows.set(kid.offsetTop, row);
          }
          for (const row of rows.values()) {
            if (row.length < 2) continue;
            const widths = row.map((kid) => kid.offsetWidth);
            const heights = row.map((kid) => kid.offsetHeight);
            if (Math.max(...widths) - Math.min(...widths) > 1.5) {
              found.push(`uneven widths in ${name(grid)}: ${widths.join(', ')}px`);
            } else if (Math.max(...heights) - Math.min(...heights) > 1.5) {
              found.push(`uneven heights in ${name(grid)}: ${heights.join(', ')}px`);
            }
          }
        }

        // 6. Text inside a round or pill shape is centred in it (rings, eggs, badges).
        for (const shape of Array.from(document.querySelectorAll('main *'))) {
          if (ignored(shape) || shape.closest('[data-reveal="hidden"]')) continue;
          const style = getComputedStyle(shape);
          if (style.transform !== 'none' || parseFloat(style.borderTopLeftRadius) < 40) continue;
          if (!shape.checkVisibility() || !shape.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(shape);
          const text = range.getBoundingClientRect();
          const box = shape.getBoundingClientRect();
          if (Math.abs(text.left + text.width / 2 - (box.left + box.width / 2)) > 3) {
            found.push(
              `text is off-centre in ${name(shape)}: "${shape.textContent.trim().slice(0, 30)}"`,
            );
          }
        }
        return found;
      });

      expect(problems, problems.join('\n')).toEqual([]);
    });
  }
}

for (const path of ROUTES) {
  test(`structure ${path}`, async ({ page }) => {
    await load(page, path, 390, 844);

    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('banner')).toHaveCount(1);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.getByRole('contentinfo')).toHaveCount(1);

    const { skipped, missingAlt } = await page.evaluate(() => {
      const levels = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((h) =>
        Number(h.tagName[1]),
      );
      const skippedHeadings: string[] = [];
      levels.forEach((level, index) => {
        const previous = levels[index - 1];
        if (previous !== undefined && level > previous + 1) {
          skippedHeadings.push(`h${previous} then h${level}`);
        }
      });
      const noAlt = Array.from(document.images)
        .filter((img) => !img.hasAttribute('alt'))
        .map((img) => img.getAttribute('src') ?? '(no src)');
      return { skipped: skippedHeadings, missingAlt: noAlt };
    });
    expect(skipped, `heading levels skip: ${skipped.join(', ')}`).toEqual([]);
    expect(missingAlt, `images without alt: ${missingAlt.join(', ')}`).toEqual([]);
  });
}
