# Well Nest Home Care Uganda — UI reconstruction report

## Outcome

Reconstructed the supplied Stage 00–07 UI work as an updated project ZIP, plus eight forward-only unified-diff patches that apply sequentially to the original uploaded website baseline. The implementation follows the stage prompts and mockup screenshots rather than blindly overlaying the stage ZIPs: comparison showed the uploaded stage archives had identical source and `if-tests-fail` copies, so they did not provide actual code deltas.

## In-scope work

- Added explicit light/dark token palettes to shared and frontend tokens. Light remains the default; OS colour-scheme is intentionally ignored. Added pre-paint HTML bootstrap scripts and the `nest-theme` storage convention.
- Added independent theme helpers for the nurse and frontend apps, with safe handling when local storage is unavailable, and accessible Light/Dark controls on nurse sign-in/Profile, public header and admin top bar.
- Kept the PWA manifest’s light/forest colours static. The HTML `theme-color` meta follows the explicit user-selected theme.
- Replaced remaining hard-coded CSS colours outside token files with semantic variables, including badges, care chips, sticky bar shadow, ring outline and admin-care styles.
- Updated the public header order, CTA arrows/variants, home hero egg palette, footer brand presentation and company links to match the supplied screens.
- Restyled Contact and the long request form without changing its submit handler or schema: phone/consent requirements, care-needed chips, area field, medical-details warning, hidden website spam trap, field validation, rate-limit/error states and request-received path remain in place. Added the “Add opening hours” placeholder until a value is configured.
- Restyled Services, Team and Areas cards without changing the page data contracts.

## Test work

Added or expanded test coverage for:

- frontend and nurse `getTheme` / `setTheme` / `initTheme`: default-light behavior, no OS-derived switching, persistence, metadata updates, invalid values and blocked storage;
- public HTML no-flash bootstrap and nurse HTML/PWA manifest invariants;
- frontend Light/Dark control, public header integration, admin top-bar integration and nurse control/login placement;
- intended Header/Footer/Button/HomePage/ContactPage copy and markup changes;
- the public-site Playwright reference-fidelity test for canonical nav order, footer links, responsive navigation, OS-dark independence and explicit Dark selection.

The existing request-form unit tests already cover the important submission and safeguard behavior; those handlers were not rewritten. See the individual test files in `frontend/src` and `nurse/src`, plus `frontend/e2e/reference-fidelity.spec.ts`.

## Verification status

- **Sequential patch application: verified.** All patches `00.patch` through `07.patch` applied in order to a fresh copy of the uploaded baseline; the resulting files matched the reconstructed source snapshot exactly.
- **CSS colour scan: checked statically.** `grep -rnE '#[0-9A-Fa-f]{3,8}|rgba?\(' frontend/src nurse/src --include='*.css' | grep -v tokens.css` returned no matches after the audit.
- **Design token JSON: parsed successfully** while generating the staged patches.
- **App test suites, typechecks, builds and browser E2E were not run in this session**, in keeping with the earlier instruction to prepare the code/tests for local execution rather than run tests here. Do not treat the test suite as passing until it is run locally.

## Recommended local verification

Run the commands below in each app directory after installing its lockfile-pinned dependencies with `npm ci`.

### Frontend

```sh
cd frontend
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run test:reference
npm run test:a11y
npm run test:responsive
```

### Nurse app

```sh
cd nurse
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run test:reference
npm run test:a11y
npm run test:responsive
```

The reference/accessibility/responsive commands use Playwright and may require the browser configured by the local Playwright config. For the complete package-specific pre-APK gate, each app also defines `npm run test:pre-apk` (the frontend gate additionally includes admin-native and general E2E checks).

## Important patch workflow

- Use the reconstructed project ZIP directly for the updated source.
- Use `reconstruction-patches/00.patch` through `07.patch` only when reproducing the changes onto a clean copy of the original project. Apply in order from the repository root with `patch -p1`.
- Do not apply these patches over an already reconstructed tree.
- After local execution, record the first failing command and its full output; fix failures one at a time, without changing API, authentication/authorization, offline queue, sync, consent, spam-trap or form-validation behavior to make tests green.
