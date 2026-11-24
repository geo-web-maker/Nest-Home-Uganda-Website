# Offline cold-start changes (not run or tested)

## Nurse app
- `app/useSession.ts`, `app/App.tsx`: on a phone with a stored refresh token and a cached account, the app opens signed in without the network. The access token is refreshed in the background (on launch, on reconnect, every 30s, on app resume). A refused refresh (401/403) returns to the sign-in screen.
- `app/useFieldProfile.ts`: the full `/field/me` profile (SOS, emergency numbers, ad-hoc, photo rules, supervisor phone, consents) is cached per account and re-applied on offline start. Consents already accepted on the device are not asked again.
- `lib/api/client.ts`: the restore request has a 15s timeout.
- `features/careforms/pdfCache.ts` (new), `DocumentViewer.tsx`, `useCareForms.tsx`: the 12 newest signed PDFs are saved to Cache Storage after each care-forms load and open offline. Cleared on sign-out and account switch. Care-forms data is also re-pulled after every sync.

## Admin app
- `features/admin/auth/authStore.ts`, `session.ts`, `useAuth.tsx`: a copy of the signed-in user is kept; if the first restore cannot reach the server (or times out at 8s) and a refresh credential is still on the device, the app opens on that user and retries the refresh when the network returns.
- `admin-native/queryPersistence.ts` (new): `['admin', ...]` query results are saved in IndexedDB (Dexie, already a dependency), per user, for 7 days, and wiped on sign-out.
- `main.tsx`: queries use `offlineFirst` (saved data shows, missing data errors instead of hanging); mutations fail fast offline.
- `admin-native/OfflineNotice.tsx` (new): offline bar with the "last saved" time.

## Not changed
- Password signing, UNMC registration, timesheets, history paging, server photo lists and mail still need a connection.
- The backend is unchanged: signed documents deliberately return empty `data`; the cached PDF covers viewing.
- Browser (non-APK) nurse app still needs a first online visit and a live session.

## Loading screens and table titles (not run or tested)
- Admin: new `components/admin/LoadingScreen.tsx` (full-page, themed) now replaces the bare "Loading…" text in `RequireAuth` and the blank login page. Plain-text loading lines (DataTable, roster, procedure, SMS config, care workspace, visit review) now use `LoadingNote` (spinner + text). Offline cold start no longer waits for the 8s timeout.
- Nurse: new `ui/Loading.tsx` (`LoadingNote`, `LoadingScreen`); mail, photos, audit, profile and editor waits use it. A short boot screen replaces the login flash while the stored session is checked.
- Titles: table captions in the care workspace and the visit schedule are now accessible-name only (they showed as a stray second title). Panel `<h2>` titles on the care dashboard, SOS, drills and last-seen pages use `SectionHeader`. A table inside a `stage-panel` no longer draws a second box.
- Every remaining loading text now animates: admin heading notes, map overlay, dashboard counts, diagnostics and download buttons (`LoadingNote inline`, `Spinner`); nurse timesheets, history and mail buttons and the timesheets banner (`mk-spinner`).
