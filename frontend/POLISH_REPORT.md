# Polish report

## Step 2A: Motion tokens and CSS policy

- Files: `src/design/tokens.css` (motion tokens appended), new `src/design/motion.css`, `src/design/global.css` (reduced-motion block: added delay resets), `src/main.tsx` (one import).
- Decisions: `NEST_FRONTEND_POLISH_PLAN.md` and `POLISH_AUDIT.md` were not in the zip, so token names/values are my own: `--dur-instant/fast/base/slow/reveal/hero`, `--ease-out/in-out/standard`, `--reveal-distance`, `--stagger-step`. Reveal states are `data-reveal="hidden|shown"`; nothing is hidden unless the hook sets it (pre-render safe).
- CI should prove: build and lint pass, no `transition: all`, static HTML unchanged.
- NOT RUN: all commands.

## Step 2B: Hooks

- Files: new `src/hooks/useReveal.ts`, new `src/hooks/usePrefersReducedMotion.ts`; removed `src/hooks/.gitkeep`.
- Decisions: `useReveal` returns a ref, creates the IntersectionObserver inside the effect, no state updates, skips elements already in view at load, skips under reduced motion or no IO, reveals once. `usePrefersReducedMotion` uses `useSyncExternalStore`, server snapshot `false`.
- CI should prove: typecheck (strict, noUnused), ESLint with zero warnings.
- NOT RUN: all commands. Hooks are not used anywhere yet (first use is Step 5C).

## Step 3A: Type scale

- Files: `tokens.css`, `global.css`.
- Decisions: fluid `clamp()` tokens `--fs-display/h1/h2/h3/lead`, fixed `--fs-body/small/eyebrow`, line-height and letter-spacing tokens. Base `h1/h2/h3` now use them (component modules that set their own size still win). `text-wrap: balance` on headings, `pretty` on paragraphs, `font-optical-sizing: auto`, antialiasing. Body size stays 16px.
- CI should prove: build, visual spot check of headings at 360 and 1180px.
- NOT RUN: all commands.

## Step 3B: Spacing, radii, depth

- Files: `tokens.css`, `shapes.module.css`.
- Decisions: spacing scale `--space-1..10` (4 to 104), radii `--r-xs..xl` and `--r-pill` taken from the radii already used across modules (8, 12, 18, 24, 28, 999; the 14/16/20 values are left for the component steps to map), forest-tinted `--shadow-1/2`, dark values with `--highlight-inset` for an inner top highlight. `.pill` now uses `--r-pill`; egg/arch/circle unchanged.
- CI should prove: build passes. Tokens are not consumed yet.
- NOT RUN: all commands.

## Step 3C: Globals and details

- Files: `global.css` (`fonts.css` untouched).
- Decisions: `::selection` gold on `--on-gold`, `accent-color: var(--leaf)`, link underline offset 0.2em and 1px thickness, `scrollbar-gutter: stable`, tap highlight off, `touch-action: manipulation` on interactive elements. No new colours were introduced outside tokens (shadow colours have dark values).
- TODO (fonts): size-adjust/ascent-override fallback faces for Fraunces and Figtree not added, because real font metrics are not known. Needs the metrics from the woff2 files (for example via fontaine or capsize) in a later session.
- NOT RUN: all commands.

## Stage 4 (steps 4A to 4I, done in one session)

- NOT RUN: all commands. CI must prove: build, typecheck, ESLint zero warnings, Prettier check, existing unit and e2e tests.
- **4A** `ui/Button.module.css`, `ui/Chip.module.css`. Hover (gated) now changes `background-color` via `--btn-hover` per variant instead of `filter`; `:active` scale 0.98; chip selected state transitions; disabled style. WhatsApp colours unchanged. `Badge.module.css` has no interaction, so it is unchanged on purpose.
- **4B/4C** `site/Header.module.css`, `site/Header.tsx`. Phone panel animates with `grid-template-rows 0fr to 1fr` (spacing moved onto the first and last `li` so the closed panel is 0px); services submenu uses the same trick. Closed panels and the desktop dropdown use `visibility` (delayed on close), so they leave the tab order; dropdown is opacity + translateY. Hover-open gated to `(hover: hover) and (pointer: fine)`. Link underline grows with `scaleX` (hover and `:focus-visible`, 700px and up). Hamburger glyph rotates 90deg when expanded. Scrolled shadow: `Header.tsx` has one passive scroll listener that sets `data-scrolled` directly on the element (no React state); the shadow is the `::after` opacity. S3.6 behaviour (Escape, focus, route-close) untouched.
- **4D** `StickyBar.module.css`: one-time slide-up (`animation ... both`, no delay, so visible by default), left/right safe-area insets, none under reduced motion. `Footer.module.css`: gated link hover, `:focus-visible`, `:active`. Press feedback on the bar comes from the 4A button `:active`.
- **4E** `ServiceCard.module.css`: gated border gold, lift 3px, shadow via `::after` opacity, photo scale 1.03 inside the existing `overflow: hidden`. `TeamCard.module.css`: photo scale only (no lift or border, it is not a link). No TSX change; the aspect-ratio guards already exist in CSS.
- **4F** `PriceCard`, `JobCard`, `InfoCard`: border gold plus `--shadow-1` pseudo-element on gated hover, no lift (they are not links). `CtaBand` and `MapPlaceholder` are static, so unchanged on purpose (their buttons get 4A behaviour).
- **4G** `Accordion.module.css`: chevron replaces +/-; `::details-content` + `interpolate-size` inside `@supports`, instant fallback. No JS.
- **4H** `Field.module.css`: border and ring fade on `:focus-visible`, error fades in with a 4px settle; input font stays 16px. NOT DONE: reserving space for the error needs `Field.tsx` to always render the message node. `CheckList.module.css`: the bullet is a diamond, not a check stroke, so it pops in (opacity and scale) once via a scroll-driven `view()` animation under `@supports`, static elsewhere and under reduced motion. No TSX.
- **4I** Pending state lives in `Button.module.css` (`[aria-busy='true']` shows a spinner ring after the label, cursor progress). `ApplicationForm.tsx` now sets `aria-busy` while sending (Booking already did). Success blocks fade in once: `ApplicationForm.module.css` `.success`; `BookingForm.tsx` adds `data-state="success"` to the thank-you section and `BookingForm.module.css` styles it. All roles and `aria-live` kept.
- Note for 9A: Button spinner and transitions use `background-color`, `border-color`, `color` and `box-shadow` in places (plan 4A/4H ask for them); everything else is transform and opacity.
