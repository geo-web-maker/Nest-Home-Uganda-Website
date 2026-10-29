
## Final reconstruction pass: stages 39–43
- Added a guarded, read-only app-release inventory backed by `GET /admin/app-releases`; publishing remains unavailable in this screen until a reviewed workflow and adoption telemetry are implemented.
- Added honest backup/hosting status states and a pre-go-live evidence checklist; no live backup provider is connected, so no backup success is claimed.
- Added a permissions entry that directs administrators to the existing Users and scopes page and explicitly avoids granting permissions without a dedicated reviewed matrix API.
- Added navigation/localization entries and token-based light/dark, focus, reduced-motion, and mobile-touch refinements.
- Added/updated backup and recovery runbooks.
- Stage 39 setting catalogue/data-retention UI and exact visual comparisons still need full browser verification; stage 42/43 screenshot-based comparison requires real app screenshots in both themes.

- Stage 39–43 follow-up gap-closure: added schema-backed care setting catalogue, read-only retention/readiness view, read-only user-by-scope matrix, and owner-only app release publishing using existing API contracts. Remaining provider telemetry, permission write matrix/pagination, retention-job evidence, and full dependency-backed tests are explicitly documented in `docs/RECONSTRUCTION_STAGE_39_TO_43.md`.
