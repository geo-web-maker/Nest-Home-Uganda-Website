# Nest Home Care Uganda — Reconstruction handover: stages 08–12

## Objective

Continue the precision reconstruction from the existing stages 00–07 baseline through public pages 08/08b and nurse-app stages 09–12, while preserving existing API, offline queue, sync, security, consent persistence and visit-action behavior.

## Stage order

| Stage | Area | Main reconstruction |
|---|---|---|
| 08 | Public site | About, How it works, pricing cards, FAQ presentation and CTA alignment |
| 08b | Public site | Privacy and Careers page presentation, job-card treatment |
| 09 | Nurse | Base cards, bottom navigation, desktop rail, SOS treatment, logo token compliance |
| 10 | Nurse | Sign-in, privacy/location disclosure and location explanation |
| 11 | Nurse | Today cards, elapsed active card, connection banner states, unscheduled-visit sheet |
| 12 | Nurse | Visit detail and active-visit timer/photo/quick-note/leave presentation |

## Important behavior boundaries

- No API endpoint, offline queue, sync algorithm or security flow was replaced for visual work.
- The sign-in identifier remains **Email or phone**, as required by the specification, even though the reference screenshot visually shows a shorter Email label.
- Forgot-password is informational only and directs the nurse to their supervisor; no reset flow was invented.
- Location disclosure remains an explicit acceptance boundary before location-dependent visit actions.
- The native location permission is not fabricated by the reconstruction. The app's existing location capture path remains responsible for the actual platform prompt.
- Unscheduled visits remain gated by the existing `adhocAllowed` value and continue through the existing start/sync flow.
- SOS remains a deliberate hold action and remains visible where the authenticated shell renders it.
- Theme colors in changed CSS/SVG use the existing design tokens; no new hard-coded hex/rgb colors were introduced.
- The standard user-facing app name is **Well Nest Home Care Uganda**; the legal **Well Nest Home Care Uganda Ltd** value remains reserved for the organisation/legal field.

## Tests written or updated

### Public site

- About page: hero/photo/API-block assertions updated for the reconstructed structure.
- How it works: process list and pricing endpoint assertions retained against the new presentation.
- FAQ: native-details behavior now verifies the first supplied FAQ opens and article links retain their route.
- Privacy: placeholder-count assertions updated to the three visible legal blocks in the reconstruction.
- Careers and JobCard: existing API/card/link behavior tests retained.

### Nurse

- Branding contract/copy tests updated for the standard user-facing app name.
- Login tests cover offline gating, Email-or-phone labeling, password/account callbacks and informational forgot-password text.
- Onboarding tests cover the two explicit disclosure acknowledgements and the post-acceptance location explanation.
- Disclosure test covers item rendering without inventing native permission behavior.
- AppShell tests cover connection status and predictable navigation state.
- Today tests cover the unscheduled-visit permission gate and sheet.
- VisitCard tests cover scheduled/in-progress action matrices and the active elapsed marker.
- ActiveVisit tests cover persisted check-in timing, photo callback, quick-note callback and Leave callback.
- VisitDetail tests continue to cover Arrive/Leave action rules.

## Local validation — deliberately not run here

The reconstruction was written and statically reviewed without running the application test suites or production builds.

### Public frontend

```bash
cd frontend
npm install
npm run typecheck
npm run lint
npm test
```

### Nurse app

```bash
cd nurse
npm install
npm run typecheck
npm run lint
npm test
```

For the full nurse validation sequence after the unit tests are clean:

```bash
npm run test:reference
npm run test:a11y
npm run test:responsive
npm run build
npm run test:e2e
```

## Static reconstruction checks completed

- All six forward patches apply cleanly in order to a clean 00–07 baseline.
- Patch replay reproduces the final reconstructed source tree exactly.
- `git diff --check` is clean for the reconstructed source history.
- No merge-conflict markers remain in frontend/nurse source or tests.
- No hard-coded hex or `rgb(...)` color declarations were introduced in the changed source/CSS/SVG files.
- Stage 08 remains under the requested approximate change budget; all individual patches are small enough for isolated review.

## Roll-forward rule

Use the reconstructed project ZIP as the working source. Use the six patches only when you need to reproduce the changes from the original 00–07 baseline. Do not apply the patches again on top of the reconstructed ZIP.
