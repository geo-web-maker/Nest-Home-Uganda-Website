# Track B follow-up checklist

Use this checklist with `TRACK_B_COMPLETION_AUDIT.md` and `NURSE_FREE_SESSION_PLAN.md`. Do not mark a checkbox complete based only on file presence; attach CI or device evidence in the notes.

## Phase source review

- [x] B1 — Sync engine extracted; sync/paging/backoff/database tests authored.
- [x] B2 — Session and field-profile hooks; session/owner/logout tests authored.
- [x] B3 — Central routes, application shell, navigation tabs and connection/waiting status.
- [x] B4 — Login and onboarding disclosure/permission flow.
- [x] B5 — Today screen and visit cards; active visit and ad-hoc gating.
- [x] B6 — Visit detail and status-based actions.
- [x] B7 — Arrival/departure sheets and atomic offline action persistence.
- [x] B8 — Persisted-time active-visit timer and safety prompt.
- [x] B9 — Notes/photos, compression, thumbnails, deferred upload and one-photo override.
- [x] B10 — Cached/paginated History screen.
- [x] B11 — Queued/deferred/needs-attention Sync screen, retry/discard controls.
- [x] B12 — Plain-language conflict mapping; safer apply-again restrictions.
- [x] B13 — Hold-confirm SOS, offline queue and SMS-composer-only fallback.
- [x] B14 — Foreground heartbeat and server-confirmed safety-timer state.
- [x] B15 — Profile/update notice; inbox gated behind a feature flag while C5 is absent.
- [x] B16 — Token-driven styles, safe-area and reduced-motion support plus style guard.
- [x] B17 — Central copy module and build-output string-guard workflow integration.

These checks mean **source authored** only. The following acceptance checklist remains open.

## Required automation — all unchecked until GitHub CI evidence is available

- [ ] Generate the nurse lockfile via the existing `nurse-lockfile` workflow.
- [ ] Review `nurse/package-lock.json` and commit it to the branch.
- [ ] Repository nurse-package, Android-override and style-guard tests pass.
- [ ] `npm ci --no-audit --no-fund` succeeds in nurse CI.
- [ ] ESLint passes with zero warnings.
- [ ] TypeScript typecheck passes.
- [ ] Vitest suite passes, including new B1–B17 regression tests.
- [ ] Vite production build succeeds.
- [ ] External URL, bundle size, font, copy/string and CSS token guards pass.
- [ ] Playwright runs successfully and diagnostics are reviewed.
- [ ] Backend tests for changed sync-pull and visit safety fields pass on a test DB.
- [ ] No GitHub runner connects to production MongoDB.
- [ ] Deployment API origin is explicitly verified in `nurse/vercel.json` CSP before deployment.

## Required manual / integration acceptance

- [ ] Login, token restore, sign-out and pending-work logout guard on supported targets.
- [ ] Owner switch does not expose another nurse’s visits, outbox records or photo list.
- [ ] Location disclosure precedes a foreground permission prompt; denial still allows an offline queue action without coordinates.
- [ ] Check-in/out remain correct offline and after a stale sync pull; no duplicate final note.
- [ ] Server rejects a queued action -> it becomes Needs attention with human-readable copy.
- [ ] Apply-again creates a new client operation ID and is unavailable for removed/unassigned/invalid payload conflicts.
- [ ] Photo compression, thumbnail, over-20 warning, storage-full failure, Wi-Fi-only preference and one-photo mobile-data override.
- [ ] Hold-to-confirm SOS, cancellation window, offline queue and SMS composer fallback; never auto-send SMS.
- [ ] Heartbeat is foreground-only and stops after check-out; no background location/service was added.
- [ ] Safety timer stays “pending sync” until server confirmation and correctly displays/clears server deadline.
- [ ] Update notice blocks below-minimum versions and non-blockingly informs about newer versions.
- [ ] Keyboard and screen-reader use; reduced motion; small screen, large text and orientation/responsive checks.
- [ ] Real Android package launch, permissions and app-resume lifecycle are verified on an owner-approved device.
- [ ] Real FCM/push acceptance only after backend C5 lifecycle exists and is configured.

## Explicit blockers / gates

- [ ] Do not enable `VITE_NURSE_INBOX_ENABLED` until Track C5 implements and tests `/field/inbox` and mark-read.
- [ ] Do not claim release-ready or signed APK until native build and owner-controlled signing workflow are complete.
- [ ] Do not record tests as passing until CI produces the real result.

**Current checkpoint:** source-authored on 2026-10-25; not executed.  
**Rule:** `Written, not run. CI will run it.`
