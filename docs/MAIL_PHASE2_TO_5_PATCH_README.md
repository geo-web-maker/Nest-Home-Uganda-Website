# Mail module Phase 2–5 patch application

## Choose the correct patch

- `NEST_MAIL_PHASE2_TO_5.patch` applies to the Phase 1 project ZIP (`Nest-Home-Uganda-Website-Mail-Phase1.zip`).
- `NEST_MAIL_ALL_PHASES.patch` applies directly to the originally uploaded `Nest-Home-Uganda-Website.zip`; it includes the Phase 1 foundation and the Phase 2–5 additions.
- The complete ZIP is the easiest option and already contains all changes.

## Apply Phase 2–5 only

From the root of the Phase 1 project:

```bash
patch -p1 --dry-run < NEST_MAIL_PHASE2_TO_5.patch
patch -p1 < NEST_MAIL_PHASE2_TO_5.patch
```

## Apply all phases to the original project

From the root of the original project:

```bash
patch -p1 --dry-run < NEST_MAIL_ALL_PHASES.patch
patch -p1 < NEST_MAIL_ALL_PHASES.patch
```

Do not apply the cumulative patch on top of the Phase 1 ZIP; that would apply Phase 1 changes twice.

## After applying

```bash
chmod +x scripts/backup-mail-postgres-to-b2.sh \
  scripts/restore-mail-postgres-from-b2.sh \
  scripts/sync-mail-attachments-to-b2.sh
```

Then install the repository's pinned dependencies and run the normal local test workflow. Regenerate OpenAPI and `api.d.ts` with the repository's authoritative generator before merging. Read `docs/MAIL_PHASE2_TO_5_IMPLEMENTATION_AUDIT.md` before configuring or enabling the feature.

## Safety

Keep `mail.enabled=false` and `mail.inbound_enabled=false` until a fresh isolated Neon database migration, full backend/frontend tests, provider fake-server tests, Cloudflare Worker checks, attachment checks and an isolated B2 restore drill pass. No live provider or Cloudflare resources are provisioned by the patch.
