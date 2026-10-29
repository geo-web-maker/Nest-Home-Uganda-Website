# Reconstruction patches

These are forward-only unified diffs made against the uploaded `Nest-Home-Uganda-Website.zip` baseline. Apply them **in numeric order, once each**, from the repository root. Do not apply them to the already reconstructed project included in this ZIP.

```sh
patch -p1 < reconstruction-patches/00.patch
patch -p1 < reconstruction-patches/01.patch
patch -p1 < reconstruction-patches/02.patch
patch -p1 < reconstruction-patches/03.patch
patch -p1 < reconstruction-patches/04.patch
patch -p1 < reconstruction-patches/05.patch
patch -p1 < reconstruction-patches/06.patch
patch -p1 < reconstruction-patches/07.patch
```

The patches contain source/test changes only; the report and this guide are delivery documentation, not part of the patch sequence.

## Stage 00 — theme tokens and no-flash startup

Patch: `00.patch` — 176 changed lines (additions + removals).

Files changed:
- `design/tokens.css`
- `design/tokens.json`
- `docs/UI_REFERENCE_GUIDE.md`
- `frontend/index.html`
- `frontend/src/design/tokens.css`
- `nurse/index.html`
- `nurse/src/pwa/manifest.test.ts`
- `nurse/src/styles.css`

Three visual/behavior checks:
1. Open a fresh browser profile with the OS in dark mode: the public site and nurse app should still start in the reviewed light palette when no choice is stored.
2. Store `nest-theme=dark` and reload: the first paint should use dark tokens without a visible light flash.
3. Confirm the nurse PWA manifest still uses the static light/forest colours; only the browser `theme-color` meta changes in later stages.

Progress-list entry: Stage 00 complete — explicit light/dark tokens and pre-paint preference bootstrap are in place.

## Stage 01 — nurse theme helper and switch

Patch: `01.patch` — 140 changed lines (additions + removals).

Files changed:
- `nurse/index.html`
- `nurse/src/components/ThemeSwitch.test.tsx (new)`
- `nurse/src/components/ThemeSwitch.tsx (new)`
- `nurse/src/copy.ts`
- `nurse/src/lib/theme.test.ts (new)`
- `nurse/src/lib/theme.ts (new)`
- `nurse/src/main.tsx`
- `nurse/src/screens/LoginScreen.test.tsx`
- `nurse/src/screens/LoginScreen.tsx`
- `nurse/src/screens/ProfileScreen.tsx`

Three visual/behavior checks:
1. On nurse sign-in and Profile, verify the Light/Dark control is reachable and each option meets the 48px touch target requirement.
2. Switch themes and reload: verify the nurse palette and browser chrome colour update and the preference persists.
3. Verify sign-in/offline states, visit sync and the saved-work flow behave as before; the switch should not block the screen when storage is denied.

Progress-list entry: Stage 01 complete — nurse theme helper and accessible explicit switch are connected.

## Stage 02 — public-site theme helper and header switch

Patch: `02.patch` — 252 changed lines (additions + removals).

Files changed:
- `frontend/index.html`
- `frontend/src/components/site/Header.module.css`
- `frontend/src/components/site/Header.test.tsx`
- `frontend/src/components/site/Header.tsx`
- `frontend/src/components/ui/ThemeSwitch.module.css (new)`
- `frontend/src/components/ui/ThemeSwitch.test.tsx (new)`
- `frontend/src/components/ui/ThemeSwitch.tsx (new)`
- `frontend/src/lib/theme-bootstrap.test.ts (new)`
- `frontend/src/lib/theme.test.ts (new)`
- `frontend/src/lib/theme.ts (new)`
- `frontend/src/locales/en/common.ts`
- `frontend/src/main.tsx`

Three visual/behavior checks:
1. Check the switch appears in both desktop navigation and the expanded phone menu, not in page content or the footer.
2. Choose Light and Dark and confirm the active button exposes `aria-pressed`, root tokens change, and browser `theme-color` follows.
3. Emulate OS dark mode with no stored choice: the site must remain light until Dark is explicitly selected.

Progress-list entry: Stage 02 complete — the public site uses its own helper and exposes one explicit header switch.

## Stage 03 — admin theme switch

Patch: `03.patch` — 36 changed lines (additions + removals).

Files changed:
- `frontend/src/features/admin/AdminLayout.module.css`
- `frontend/src/features/admin/AdminLayout.test.tsx`
- `frontend/src/features/admin/AdminLayout.tsx`
- `frontend/src/locales/en/admin.ts`

Three visual/behavior checks:
1. Verify the admin top bar has the labelled Light/Dark switch and that the selected button is announced as pressed.
2. Check admin care screens, cards, tables, side navigation and phone bottom navigation in both palettes.
3. Confirm permission-aware navigation, More menu, logout and route focus behavior are unchanged.

Progress-list entry: Stage 03 complete — the admin shell reuses the public-site theme preference and has an integration test.

## Stage 04 — dark-mode CSS colour audit

Patch: `04.patch` — 84 changed lines (additions + removals).

Files changed:
- `design/tokens.css`
- `design/tokens.json`
- `frontend/src/components/site/Rings.module.css`
- `frontend/src/components/site/StickyBar.module.css`
- `frontend/src/components/ui/Badge.module.css`
- `frontend/src/components/ui/Chip.module.css`
- `frontend/src/design/tokens.css`
- `frontend/src/features/admin/care/care-screen.css`
- `frontend/src/features/admin/care/care.css`

Three visual/behavior checks:
1. Compare badges, care chips, sticky bar shadow and ring outlines in light and dark; no component should retain a fixed light-only colour.
2. Review readable text on leaf/straw/danger surfaces in dark mode.
3. Confirm the CSS audit `grep` finds no hex or rgb/rgba declarations outside token files in `frontend/src` and `nurse/src` CSS.

Progress-list entry: Stage 04 complete — remaining non-token CSS colours use semantic theme tokens.

## Stage 05 — header, hero buttons, eggs and footer

Patch: `05.patch` — 344 changed lines (additions + removals).

Files changed:
- `frontend/e2e/reference-fidelity.spec.ts`
- `frontend/src/components/site/CtaBand.tsx`
- `frontend/src/components/site/Footer.module.css`
- `frontend/src/components/site/Footer.test.tsx`
- `frontend/src/components/site/Footer.tsx`
- `frontend/src/components/site/Header.module.css`
- `frontend/src/components/site/Header.test.tsx`
- `frontend/src/components/site/Header.tsx`
- `frontend/src/components/ui/Button.module.css`
- `frontend/src/components/ui/Button.test.tsx`
- `frontend/src/components/ui/Button.tsx`
- `frontend/src/features/public/home/HomePage.module.css`
- `frontend/src/features/public/home/HomePage.test.tsx`
- `frontend/src/features/public/home/HomePage.tsx`
- `frontend/src/locales/en/common.ts`

Three visual/behavior checks:
1. At desktop width, check the visible order is Home, Services, About, How it works, Team, Areas, FAQ, Contact; Services remains expandable.
2. Check both hero actions have a decorative arrow; the second action is filled forest-green, and the three egg captions remain readable.
3. Check the footer uses the brand logo/subtitle and the company links match the mockup without a Careers link; repeat at phone width.

Progress-list entry: Stage 05 complete — primary navigation, CTA treatments, egg palette and footer follow the reference composition.

## Stage 06 — contact page and request form

Patch: `06.patch` — 42 changed lines (additions + removals).

Files changed:
- `frontend/src/features/public/booking/BookingForm.module.css`
- `frontend/src/features/public/booking/BookingForm.tsx`
- `frontend/src/features/public/contact/ContactPage.module.css`
- `frontend/src/features/public/contact/ContactPage.test.tsx`
- `frontend/src/features/public/contact/ContactPage.tsx`
- `frontend/src/locales/en/site.ts`

Three visual/behavior checks:
1. Check the contact page’s call/WhatsApp controls, office/hours cards, map placeholder and request form stack correctly at mobile and desktop widths.
2. When opening hours are not configured, the Hours card should say “Add opening hours”.
3. Exercise required phone and consent, care-needed selection, the medical-details warning, hidden website spam trap, validation/rate-limit errors and the received state.

Progress-list entry: Stage 06 complete — contact and form presentation is restyled while request behavior and safeguards are retained.

## Stage 07 — services, team and areas cards

Patch: `07.patch` — 205 changed lines (additions + removals).

Files changed:
- `frontend/src/components/site/ServiceCard.module.css`
- `frontend/src/components/site/TeamCard.module.css`
- `frontend/src/features/public/areas/AreasPage.module.css`

Three visual/behavior checks:
1. Check Services cards keep the arch/icon treatment and readable text in the responsive grid.
2. Check Team cards use the framed photo placeholder and clear name/role treatment without inventing team data.
3. Check Areas tags wrap naturally at 320px and do not introduce horizontal overflow.

Progress-list entry: Stage 07 complete — Services, Team and Areas card styling is aligned to the supplied reference screens.
