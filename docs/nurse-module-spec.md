# Nurse Module: Implementation Spec (v1.4)

> Audience: an AI coding assistant (and the human reviewing it).
> Goal: add a **nurse field app** (installable, offline-first, location-verified visits) to an **existing website that already has a public site and an admin section**, in **safe, small phases**, without breaking what already works.

---

## 0. How to use this document (READ FIRST)

1. Work on **ONE phase at a time** (Section 17). Never start a phase until the previous one's acceptance criteria are met and the human confirms.
2. **Do not refactor or restyle existing public/admin code** unless the phase explicitly says so. All backend changes are **additive** (new tables, new endpoints, new routes). Existing behavior must keep working.
3. Anything marked `[FILL IN]` is unknown. **Ask the human**, or inspect the existing codebase, before guessing.
4. Follow the design system (Section 10) exactly. Do not invent new colors, fonts, or spacing values.
5. After each phase, output: (a) files created/changed, (b) how to run/test, (c) what is intentionally NOT done yet.
6. If a requirement conflicts with the existing code, **stop and report the conflict** instead of silently choosing.
7. Prefer boring, well-known libraries. Do not add a dependency without stating why.

---

## 0.5 Confirmed decisions (v1.1). These OVERRIDE anything later in this document

| Topic | Decision |
|---|---|
| Frontends | React + Vite. Public site uses Vite SSG. Admin and nurse apps are client-side SPAs. |
| Backend | **FastAPI (Python)**. Hand-rolled JWT auth already exists. Nurses use the same auth system with a new role. |
| Database | **MongoDB (Atlas)**. No SQL migrations: use collections, validators and indexes. Table names in Section 6 are collection names. Postgres only if a hard need appears (none today). |
| Backups | Same design as BallotBox: scheduled dump to **immutable Backblaze B2** storage, plus a second MongoDB database used as rolling copy and restore-test target. Production DB must move off the free M0 tier before real data. See 16.2. |
| Roles | `super_admin`, `admin`, `supervisor`, `nurse`. See Section 5. |
| Scheduling | Visits are scheduled by the **supervisor of that nurse** (admins and super admins can too). |
| Ad hoc visits | **Off by default.** A **super admin** can switch them on (globally, with optional per-nurse override). See 7.3, 11.13, 12.8. |
| Client locations | A client can have several locations over time (e.g. hospital, then home). See 6.3. |
| Photos | Photo proof supported, stored in **Cloudinary**, with an offline capture queue. See 8.5, 11.12, Phase 5B. |
| What nurses see | Client name, location (address + map pin), scheduled time, short instructions. **Nothing else.** No medical notes. |
| Pagination | On by default for every list endpoint (cursor-based). Default page size 20, max 100. |
| Time zone | Store UTC. Display in East Africa Time (`Africa/Kampala`, UTC+3). |
| Compliance | Uganda Data Protection and Privacy Act, 2019. See 16.1. |
| Distribution | iPhone: PWA. Android: signed APK. Firebase App Distribution is used **only to deliver the APK** (not as a backend), with a self-hosted fallback. See Section 15. |
| Brand colors | **Not decided.** Section 10 colors are placeholders. All colors live only in `packages/ui` tokens so a rebrand is a one-file change. Never hardcode a color anywhere else. |
| Scale | Unknown. Design for hundreds of nurses and thousands of clients. Measure and tune later. |
| Modules (v1.2) | A: Attendance and location verification (core, Sections 1 to 21). B: Timesheets, executive dashboard and exception alerts (Section 22). C: Safety / SOS (Section 23). D: Patient profiles and care logging (Section 24, **gated**). |
| Monitoring approach | **No continuous GPS tracking.** Every logged action takes a best-effort location snapshot (Section 9.5). "Idle" and "late" are judged from the schedule plus these snapshots, not from live tracking. |
| Permission model | Per-resource level **none / read / write**, plus a data scope (own / team / all), enforced server-side. See Section 5. |
| Settings philosophy (v1.3) | **Anything that can be a variable is a variable**, set later by the organization (Section 25). Code ships sane defaults. Nothing blocks development waiting for a business answer. |
| Roles and scopes | **None exist yet.** Phase 2 creates the permission model (Section 5) from scratch. The code base will be shared for a Phase 0 audit. |
| Login identifier | Undecided, so **configurable**: email, phone number, or either (Section 25). |
| Language | English only for now. Keep all UI text in one strings file so languages can be added later. |
| Device baseline | Low-end Android phones around the USD 100 class must work well. See Section 26. |
| SMS | Provider: Mambo SMS (already available to the developer), behind a swappable adapter. See Section 27. |
| On-call / SOS responders | Roster to be defined by the organization. A ready-made roster feature and response procedure template exist (Section 27). SOS stays hidden until a responder is configured. |
| Account ownership | Developer owns accounts for now; ownership is transferable. Keep a handover checklist (Section 15). |
| TO-DO (open) | **Module E: Website requests inbox** (Section 28) and the **code review of the existing website**. Both pending the developer sharing the code. |
| Care logging gate | Module D does not start until the legal review, PDPO registration covering health data, and the device-security work in 24.1 are complete. |

---

## 1. Context and goals

### 1.1 Current state (to be confirmed in Phase 0)
- Public marketing site: React + Vite SSG. `[FILL IN: repo layout]`
- Admin section (React) with hand-rolled JWT auth on FastAPI. `[FILL IN: where it is hosted, how it calls the API]`
- Backend: FastAPI (Python). Database: MongoDB Atlas (two accounts: main + backup). `[FILL IN: ODM/driver in use (Motor, PyMongo, Beanie), existing collection naming conventions]`
- Hosting: Vercel.

### 1.2 What we are adding
A **Nurse App** that lets nurses:
- Log in securely and see their assigned visits.
- **Check in** and **check out** at a client's location, capturing GPS, accuracy, and timestamps.
- Work **fully offline**, with automatic sync later.
- Install on their phone (PWA for everyone; native Android wrapper for background location).

And **Admin additions** so staff can:
- Manage nurses, client locations, and visit schedules.
- Review visits, durations, and location-verification results.
- Export reports.

### 1.3 Platform plan
| Platform | Delivery | Location capability |
|---|---|---|
| iPhone nurses | PWA (installed to home screen) | Foreground only. Manual "Arrive / Leave" buttons. |
| Android nurses | Capacitor app (APK via Firebase App Distribution) | Foreground, plus optional background location and geofence arrival detection. |
| Any browser | Same PWA | Foreground only. |

One React codebase serves all three. Capacitor is added in Phase 7, not before.

### 1.4 Non-goals (for now)
- No billing/payroll calculation.
- No in-app chat.
- No public App Store / Play Store listing.
- No automatic iOS background tracking.

---

## 2. Non-negotiable principles

1. **Server is the authority.** Permissions, location validation, and duration are computed/enforced on the server. The client is never trusted.
2. **Offline-first.** Every nurse action works with no connection. Actions go to a local outbox and sync later.
3. **Idempotent writes.** Every record created on a device has a client-generated UUID. Retrying must never create duplicates.
4. **Append-only visit events.** Check-in/out events are never edited or deleted. Corrections are new events or admin annotations with an audit trail.
5. **Least privilege.** Nurses see only their own visits and only the data needed for them.
6. **Additive rollout.** New features hide behind feature flags until ready.
7. **Honest data.** Always store the *source* of a record (`app_auto`, `app_manual`, `pwa_manual`, `admin_edit`) so reports can show how it was captured.
8. **Mobile-first, thumb-first** UI for the nurse app. Large touch targets, minimal typing.

---

## 3. Architecture

```
                        ┌──────────────────────────┐
                        │  Shared Backend / API    │
                        │  Auth (roles) + DB       │
                        │  + Storage (optional)    │
                        └───────────▲──────────────┘
                                    │ HTTPS (JWT)
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
┌───────┴────────┐        ┌─────────┴────────┐        ┌─────────┴─────────┐
│ www.site.com   │        │ admin.site.com   │        │ app.site.com      │
│ Public site    │        │ Admin app        │        │ Nurse app (PWA)   │
│ SSG, SEO       │        │ SPA, noindex     │        │ + Capacitor build │
└────────────────┘        └──────────────────┘        └───────────────────┘
        Vercel project 1        Vercel project 2            Vercel project 3
```

- **One Git monorepo, three Vercel projects**, each pointing to its own folder.
- Subdomains cost nothing extra.
- `admin` and `app` are `noindex` and excluded from sitemaps.
- If the existing admin lives inside the public site today, **do not move it in Phase 1**. Keep it where it is and only plan the move as an optional later phase. `[FILL IN: where admin lives now]`

---

## 4. Monorepo layout (target)

```
/
├─ apps/
│  ├─ web/            # existing public site (SSG)            [existing]
│  ├─ admin/          # admin app                             [existing, maybe moved later]
│  └─ nurse/          # NEW: nurse PWA (+ Capacitor)
│     ├─ src/
│     │  ├─ app/            # routes, providers, layout shell
│     │  ├─ features/
│     │  │  ├─ auth/
│     │  │  ├─ visits/      # list, detail, check-in/out
│     │  │  ├─ sync/        # outbox, pull, status UI
│     │  │  ├─ history/
│     │  │  └─ settings/
│     │  ├─ lib/
│     │  │  ├─ db/          # Dexie schema + repos
│     │  │  ├─ api/         # typed API client
│     │  │  ├─ location/    # web + native location adapters
│     │  │  └─ platform/    # Capacitor.isNativePlatform() helpers
│     │  └─ main.tsx
│     ├─ capacitor.config.ts   # added in Phase 7
│     └─ android/              # generated in Phase 7
├─ packages/
│  ├─ ui/             # shared components + design tokens
│  ├─ types/          # shared TypeScript types (API contracts)
│  ├─ geo/            # haversine, verification logic (pure functions)
│  └─ config/         # eslint, tsconfig, tailwind preset
├─ docs/
│  └─ this-spec.md
├─ package.json       # pnpm workspaces (or Turborepo)
└─ pnpm-workspace.yaml
```

Rules:
- `packages/geo` is **pure functions with unit tests**. It is used by the server and the client so verification logic is identical.
- `packages/types` is the single source of truth for API shapes.
- `packages/ui` holds design tokens first (Phase 1), components as they are needed.

---

## 5. Permissions: resource levels and data scope

**Model (confirmed):** every user has, for each **resource**, a level of **none** (the data does not exist for them), **read**, or **write** (write includes read). A second setting, the **data scope** (`own`, `assigned`, `team`, `all`), says *whose* records. Both are checked on the server for every request. The server derives data scope from the user's record (never from request parameters).

**Presets** (named bundles; the code checks levels and scopes, never role names): `nurse`, `supervisor`, `admin`, `executive` (CEO: read-only oversight), `super_admin`. A **team** = nurses whose profile has `supervisor_id` equal to that supervisor. None of these roles or scopes exist in the current system. Phase 2 creates them from scratch. Custom per-user overrides are allowed (e.g. a "records clerk" with `reports: read` and everything else `none`). `[FILL IN: confirm supervisors are clinical staff, and who may see clinical data]`

| Resource | nurse | supervisor | admin | executive | super_admin |
|---|---|---|---|---|---|
| visits (schedule, assign, cancel) | read (own) | write (team) | write (all) | read (all) | write (all) |
| visit_events (check-in/out) | write (own) | none | none | none | none |
| notes | write (own) | read (team) | read (all) | read (all) | read (all) |
| photos (proof) | write (own) | read (team) | read (all) | none | read (all) |
| verification (distance, accuracy) | none (status only) | read (team) | read (all) | read (all) | read (all) |
| flags | none | write (team) | write (all) | read (all) | write (all) |
| clients | read (assigned) | write (team) | write (all) | read (all) | write (all) |
| locations and stays | read (assigned) | write (team) | write (all) | read (all) | write (all) |
| nurses | none | read (team) | write (all) | read (all) | write (all) |
| users (admins, supervisors) | none | none | none | none | write (all) |
| timesheets | write (own, draft and submit) | write (team, approve) | write (all) | read (all) | write (all) |
| dashboard | none | read (team) | read (all) | read (all) | read (all) |
| alerts | none | write (team, acknowledge/resolve) | write (all) | read (all) | write (all) |
| sos | write (own, send/cancel) | write (team, respond) | write (all, respond) | read (all) | write (all) |
| reports | none | read (team) | read (all) | read (all) | read (all) |
| settings | none | none | read | none | write |
| patient_profiles (Module D) | read (assigned) | write (team) | none | none | none |
| medications (Module D) | read (assigned) | write (team) | none | none | none |
| care_plans (Module D) | read (assigned) | write (team) | none | none | none |
| care_logs (Module D) | write (own) | read (team) | none | none | none |
| care_photos (Module D) | write (own) | read (team) | none | none | none |

Rules:
- **none = invisible.** The endpoint refuses, and those fields are omitted from responses (not merely hidden in the UI).
- The ad hoc visit toggle and similar switches live under `settings` (super_admin write only).
- Clinical data (Module D) is deliberately **none** for admin, executive and super_admin. They see aggregate statistics only, through `reports`. Changing this needs a documented reason and a legal review.
- Store a user's levels in their record as `{ resource: { level, scope } }`. Put the resource list and presets in **one shared file** reused by the other systems (BallotBox, school system).
- Re-read a user's current levels from the database for sensitive actions so a revoked permission applies before the token expires.
- Every grant or revocation is written to `audit_log`. Keep resource names stable once released.

Enforcement: **server-side** (row-level rules or middleware). Frontend hiding is cosmetic only.

---

## 6. Data model

These are **MongoDB collections**. Follow the existing backend's ID and naming conventions. See 6.3 for Mongo-specific rules, indexes and additions.

### 6.1 Tables

**nurses** (extends the existing users table, or a profile table linked to it)
- `id` (uuid, pk, = auth user id)
- `full_name`, `phone`, `email`
- `status` (`active` | `inactive`)
- `created_at`, `updated_at`

**clients**
- `id`, `full_name` (or display label), `notes_for_nurse` (short, non-sensitive)
- `status` (`active` | `inactive`)

**client_locations**
- `id`, `client_id` (fk)
- `label` (e.g. "Home")
- `address_text`
- `lat`, `lng`
- `radius_m` (default 150)
- `is_primary` (bool)

**visits**
- `id` (uuid), `client_id`, `location_id`, `nurse_id`
- `scheduled_start`, `scheduled_end`
- `status` (`scheduled` | `in_progress` | `completed` | `missed` | `cancelled`)
- `instructions` (short text)
- `created_by`, `created_at`, `updated_at`

**visit_events** (append-only)
- `id` (uuid, **client-generated**)
- `visit_id`, `nurse_id`
- `type` (`check_in` | `check_out`)
- `device_time` (timestamp from phone)
- `server_received_at` (timestamp set by server)
- `lat`, `lng`, `accuracy_m`
- `source` (`app_auto` | `app_manual` | `pwa_manual` | `admin_edit`)
- `verification` (`verified` | `outside_radius` | `low_accuracy` | `no_location` | `pending`)
- `distance_m` (computed by server)
- `device_info` (json: platform, app version)
- `client_op_id` (uuid, idempotency key)

**visit_notes**
- `id` (client-generated uuid), `visit_id`, `author_id`, `body`, `created_at_device`, `server_received_at`

**visit_flags** (computed or manual)
- `id`, `visit_id`, `type` (`outside_radius` | `low_accuracy` | `no_location` | `clock_skew` | `duration_short` | `duration_long` | `missing_checkout`), `resolved` (bool), `resolved_by`, `resolved_note`

**audit_log**
- `id`, `actor_id`, `action`, `entity`, `entity_id`, `before` (json), `after` (json), `at`

**app_releases** (for update prompts)
- `id`, `platform` (`android`), `version`, `min_supported_version`, `download_url`, `notes`, `released_at`

### 6.2 Derived values (computed by server, never trusted from client)
- `distance_m` = haversine(event lat/lng, location lat/lng)
- `verification` per rules in Section 9
- Visit duration = `check_out.device_time` minus `check_in.device_time`, with a sanity comparison against server receive times. Store both and flag large differences (`clock_skew`).

### 6.3 v1.1 additions (MongoDB specifics)

**Conventions**
- Server-created documents use `_id` (ObjectId). Documents created on a device (`visit_events`, `visit_notes`, `visit_photos`, ad hoc `visits`) carry a client-generated UUID in `id` with a **unique index**.
- All timestamps stored in UTC. Convert to `Africa/Kampala` only in the UI.
- No hard deletes for visit data. Use `status` fields. Visit data is append-only or audited.
- Use one driver/ODM only (whatever the backend already uses). Do not introduce a second.
- Prefer single-document atomic updates (`$set`, `$push` with unique-index protection) over multi-document transactions. If a transaction is truly needed, Atlas replica sets support them.

**New or changed collections**
- `nurse_profiles`: `user_id`, `full_name`, `phone`, `supervisor_id`, `status`, `adhoc_override` (`null` | `true` | `false`), `created_at`.
- `client_location_stays`: `id`, `client_id`, `location_id`, `starts_on`, `ends_on` (`null` = current), `reason` (`home` | `hospital` | `care_facility` | `other`), `created_by`. This models a client moving from hospital to home.
- `client_locations`: add `geo` as a GeoJSON Point `{ type: "Point", coordinates: [lng, lat] }` (note the order).
- `clients`: add `photo_allowed` (bool, default true). When false, the nurse app hides the camera for that client.
- `visits`: add `supervisor_id` (denormalized at creation), `adhoc` (bool), `created_by_role`, and **`location_snapshot`** `{ address_text, lat, lng, radius_m, geo }` copied at scheduling time. Later edits to a client's location must **never rewrite history**; verification always uses the snapshot.
- `visit_photos`: `id` (client UUID), `visit_id`, `nurse_id`, `cloudinary` `{ public_id, version, bytes, format, width, height }`, `kind` (`arrival` | `departure` | `other`), `caption`, `captured_at_device`, `lat`, `lng`, `accuracy_m`, `server_received_at`, `status` (`registered` | `rejected`), `client_op_id`.
- `settings`: key/value documents, e.g. `allow_adhoc_visits=false`, `max_photos_per_visit=5`, `photo_required_on_checkout=false`, `geofence_default_radius_m=150`, `geofence_max_accuracy_m=100`, duration thresholds.
- `consents`: `user_id`, `type` (`privacy_notice` | `location`), `version`, `accepted_at`.

**Indexes (minimum)**
- `visit_events`: unique `{ id }`, unique `{ client_op_id }`, `{ visit_id: 1, device_time: 1 }`
- `visit_photos`: unique `{ id }`, unique `{ client_op_id }`, `{ visit_id: 1 }`
- `visits`: `{ nurse_id: 1, scheduled_start: 1 }`, `{ supervisor_id: 1, scheduled_start: 1 }`, `{ status: 1, scheduled_start: 1 }`
- `client_locations`: `2dsphere` on `geo`
- `client_location_stays`: `{ client_id: 1, starts_on: -1 }`
- `visit_flags`: `{ resolved: 1, type: 1, created_at: -1 }`
- `audit_log`: `{ entity: 1, entity_id: 1, at: -1 }`
- Add Mongo schema validators for the append-only collections.

---

## 7. API contract

All endpoints require auth and are role-checked. Types live in `packages/types`. REST on FastAPI. Use Pydantic models mirrored by the types in `packages/types`.

### 7.1 Nurse-facing
| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/login` | Existing auth, nurse role |
| GET | `/me` | Profile + role + app config (feature flags, geofence defaults, min app version) |
| GET | `/sync/pull?cursor=` | Visits assigned to the nurse, client/location data needed, changes since cursor |
| POST | `/sync/push` | Batch of offline operations (below) |
| GET | `/app/version?platform=android` | Latest + minimum supported version |

**POST `/sync/push` body**
```json
{
  "device_id": "uuid",
  "ops": [
    {
      "client_op_id": "uuid",
      "kind": "visit_event",
      "payload": {
        "id": "uuid",
        "visit_id": "uuid",
        "type": "check_in",
        "device_time": "2026-01-05T09:02:11+01:00",
        "lat": 0.0, "lng": 0.0, "accuracy_m": 12.5,
        "source": "pwa_manual",
        "device_info": { "platform": "ios-pwa", "app_version": "1.0.0" }
      }
    },
    { "client_op_id": "uuid", "kind": "visit_note", "payload": { } }
  ]
}
```

**Response**
```json
{
  "results": [
    { "client_op_id": "uuid", "status": "accepted", "server": { "verification": "verified", "distance_m": 34 } },
    { "client_op_id": "uuid", "status": "duplicate" },
    { "client_op_id": "uuid", "status": "rejected", "reason": "visit_not_assigned" }
  ],
  "cursor": "opaque-string"
}
```
- `duplicate` is a **success** from the client's point of view (remove from outbox).
- `rejected` means do not retry. Move to a "needs attention" list.

### 7.2 Admin-facing
| Method | Path | Purpose |
|---|---|---|
| GET/POST/PATCH | `/admin/nurses` | List, invite/create, deactivate |
| GET/POST/PATCH | `/admin/clients` | Manage clients |
| GET/POST/PATCH | `/admin/clients/:id/locations` | Manage locations (lat/lng, radius) |
| GET/POST/PATCH | `/admin/visits` | Schedule, reassign, cancel |
| GET | `/admin/visits/:id` | Visit with events, notes, flags, audit |
| POST | `/admin/visits/:id/annotate` | Admin correction/comment (audited) |
| POST | `/admin/flags/:id/resolve` | Resolve a flag with a note |
| GET | `/admin/reports/visits?from=&to=&nurse=&client=&format=csv\|json` | Report/export |
| GET/PATCH | `/admin/settings/geofence` | Default radius, accuracy threshold, duration thresholds |
| POST | `/admin/app-releases` | Publish a new Android version record |

### 7.3 v1.1 additions

**Pagination contract (all list endpoints):** `GET ...?limit=20&cursor=<opaque>` returns `{ "items": [...], "next_cursor": "..." | null }`. Default `limit` 20, max 100. Cursor-based, never offset-based.

**Scope rule:** supervisor scoping is derived by the server from the caller's role and `supervisor_id`. It is **never** taken from a query parameter. An admin-style endpoint called by a supervisor returns only that supervisor's team.

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/visits/adhoc` | nurse | Create an unscheduled visit. Rejected unless `allow_adhoc_visits` is on (or the nurse override is true). Client must be one of the nurse's assigned clients (pick from list, no free text). Visit is auto-flagged `adhoc` for supervisor review. |
| POST | `/photos/sign` | nurse | Returns Cloudinary signed-upload parameters for a visit. Checks assignment, max photo count, `clients.photo_allowed`. |
| POST | `/visits/:id/photos` | nurse | Register uploaded photo metadata. Idempotent by `id`. |
| GET | `/admin/visits/:id/photos` | supervisor+ | Returns short-lived signed delivery URLs. Each view is written to `audit_log`. |
| POST | `/admin/clients/:id/stays` | admin, supervisor (team) | Move a client to a location from a date (closes the previous stay). |
| PATCH | `/admin/nurses/:id/supervisor` | admin+ | Assign or change a nurse's supervisor (audited). |
| GET/PATCH | `/admin/settings/features` | super_admin | Ad hoc toggle, photo rules, thresholds. |
| POST | `/consents` | any | Record privacy-notice / location consent with version. |

**New sync op kinds:** `visit_photo` (metadata, sent only after the image upload succeeds) and `visit_create_adhoc`. If an op is `rejected` (e.g. ad hoc turned off meanwhile), it moves to "Needs attention" and is never silently dropped.

---

## 8. Offline-first design

### 8.1 Local storage
- **IndexedDB via Dexie** (web/PWA). In the native app, same code first; migrate to SQLite plugin only if iOS/Android storage eviction proves a problem.
- Request persistent storage on first run: `navigator.storage.persist()`.

### 8.2 Local tables
- `visits`, `clients`, `locations` (read cache, from pull)
- `outbox` (pending operations): `{ client_op_id, kind, payload, created_at, attempts, last_error, status }`
- `meta` (cursor, last_sync_at, device_id, app_version)

### 8.3 Sync algorithm
1. **Pull** on app open, on regain of connectivity, and every N minutes while open. Merge by `id`. Server wins for visit/schedule data.
2. **Push** the outbox in order, in batches. On `accepted` or `duplicate`, delete the op. On network failure, keep and back off (exponential, cap at a few minutes). On `rejected`, mark `needs_attention`.
3. Local UI always reads from local DB, never directly from the network.
4. Show clear sync status (Section 11, Sync screen).

### 8.4 Rules
- Check-in/out writes **first** to local DB (instant UI), **then** the outbox.
- A visit shows "pending sync" until the server confirms.
- The app must handle: app killed mid-action, phone reboot, airplane mode, expired auth token while offline (queue stays; ask to log in again when online, **do not discard the outbox**).
- Never block check-in because location is slow. Take the best available fix within ~10 seconds, otherwise save with `no_location` and let the nurse proceed. The server flags it.
- Cache the app shell with Workbox via `vite-plugin-pwa` (precache build assets, runtime-cache API GETs sparingly).

### 8.5 Offline photo proof (Cloudinary)

1. Nurse taps **Add photo** during an active visit. Use `<input type="file" accept="image/*" capture="environment">` (works in PWA and Capacitor). Camera plugin can replace it later.
2. **Compress on the device**: longest side 1280 px, JPEG quality about 0.7, target under 400 KB. Never upload raw camera files (data is expensive and networks are slow).
3. Save the blob in IndexedDB (`photos` table, state `pending_upload`) **and** create an outbox op. Also record GPS and time at capture.
4. When online, process in order: `POST /photos/sign` -> upload directly to Cloudinary with the signature -> `POST /visits/:id/photos` (metadata) -> mark done and delete the local blob.
5. Each step is retryable on its own. The blob is kept until the metadata is registered. Show thumbnails with a "pending" badge.
6. Upload with Cloudinary `type: authenticated` (not public) into folder `visits/{visit_id}`. Admin UI receives signed, expiring URLs.
7. Server caps: max photos per visit (setting), allowed MIME types, max bytes. Reject otherwise.
8. Guard device storage: warn if more than about 20 photos are pending.
9. Wi-Fi-only upload option in Settings (nurses on limited mobile data).

---

## 9. Location and verification logic

### 9.1 Capture (client)
On "Arrive" and "Leave":
1. Request a high-accuracy position (timeout ~10 s, `maximumAge` ~0).
2. Save `lat`, `lng`, `accuracy_m`, `device_time`.
3. If it fails, save the event with null coordinates and `verification = no_location` pending server review.

### 9.2 Verify (server, authoritative)
Settings (admin-configurable, defaults): `radius_m = 150`, `max_accuracy_m = 100`.

```
if lat/lng missing                     -> no_location
else if accuracy_m > max_accuracy_m    -> low_accuracy
else if distance_m <= location.radius_m + min(accuracy_m, 50)
                                       -> verified
else                                   -> outside_radius
```
Create flags for anything not `verified`, plus:
- `clock_skew`: |device_time - server_received_at| greater than a threshold *and* the event was not queued offline for that long (compare with outbox created_at when provided).
- `duration_short` / `duration_long`: outside admin thresholds.
- `missing_checkout`: visit still `in_progress` well after `scheduled_end`.

### 9.3 Honesty in the UI
- Nurses see simple states: **Verified**, **Needs review**, **Pending sync**. Never expose raw distances or accusatory wording.
- Admins see full detail (distance, accuracy, source, map).

### 9.4 Native-only (Phase 7)
- Background location + optional geofence arrival prompt ("You seem to have arrived. Check in?"). Auto events use `source = app_auto`.
- Android needs: foreground service notification, "Allow all the time" permission flow, battery-optimization guidance, and the Play-style prominent disclosure screen (also good practice outside Play).

### 9.5 Location snapshots on every logged action (v1.2)

This is the "smart monitoring" approach: no continuous tracking, but a trail of evidence built from normal use.

- Every action the nurse logs (check-in, check-out, note, photo, task done, SOS) attaches a `geo_snap`: `{ lat, lng, accuracy_m, captured_at }`.
- **Best effort and non-blocking.** Wait at most about 3 seconds for a fix. If none, save the action with `geo_snap = null` and never block the nurse.
- The server compares each snap to the visit's `location_snapshot` and stores `distance_m` and an `in_range` boolean on the action. A visit whose later actions are far from the client's location gets a `left_site` flag for review.
- Also record `last_seen_at` for each device on app open, sync and each action (a "heartbeat"), plus optional battery percentage.
- Nurses are told clearly in the privacy notice and onboarding that location is captured only when they log an action (and on SOS).

---

## 10. Design system

> Applies to **nurse app and new admin screens**. Existing screens keep their look unless a phase says otherwise. Implement tokens once in `packages/ui` and consume them everywhere. `[FILL IN: if the existing site already has brand colors/fonts, replace the primary palette below with them and keep the rest.]`

### 10.1 Design tokens (CSS variables)

```css
:root {
  /* Brand */
  --color-primary-50:  #F0FDFA;
  --color-primary-100: #CCFBF1;
  --color-primary-500: #14B8A6;
  --color-primary-600: #0D9488;
  --color-primary-700: #0F766E;   /* main action color */
  --color-primary-900: #134E4A;

  /* Neutrals */
  --color-bg:          #F8FAFC;
  --color-surface:     #FFFFFF;
  --color-border:      #E2E8F0;
  --color-text:        #0F172A;
  --color-text-muted:  #475569;
  --color-text-faint:  #94A3B8;

  /* Status */
  --color-success:     #15803D;  --color-success-bg: #DCFCE7;
  --color-warning:     #B45309;  --color-warning-bg: #FEF3C7;
  --color-danger:      #B91C1C;  --color-danger-bg:  #FEE2E2;
  --color-info:        #1D4ED8;  --color-info-bg:    #DBEAFE;
  --color-offline:     #475569;  --color-offline-bg: #E2E8F0;

  /* Typography */
  --font-sans: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --text-xs: 12px;  --text-sm: 14px;  --text-base: 16px;
  --text-lg: 18px;  --text-xl: 22px;  --text-2xl: 28px;
  --weight-regular: 400; --weight-medium: 500; --weight-semibold: 600;

  /* Spacing (4px scale) */
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px;

  /* Shape and elevation */
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-pill: 999px;
  --shadow-card: 0 1px 2px rgba(15,23,42,.06), 0 1px 3px rgba(15,23,42,.08);
  --shadow-sheet: 0 -4px 24px rgba(15,23,42,.18);

  /* Touch */
  --touch-min: 48px;
}
```
Dark mode: **out of scope for v1**. Structure colors as variables so it can be added later.

### 10.2 Layout rules (nurse app)
- Designed at **360 to 430px width**; scales up gracefully with a centered max-width of 560px on larger screens.
- Respect safe areas: `padding: env(safe-area-inset-top) ... env(safe-area-inset-bottom)`.
- Bottom tab bar (3 tabs): **Today**, **History**, **Profile**. 64px high + safe area.
- Primary action buttons are **full width, 56px high**, placed in the lower third of the screen (thumb reach).
- One primary action per screen.
- Body text 16px minimum. Never below 14px except captions.
- Contrast: WCAG AA minimum. Do not use color alone to convey state; pair with icon + text.

### 10.3 Components (build these in `packages/ui`)
| Component | Spec |
|---|---|
| `Button` | Variants: primary (filled `primary-700`, white text), secondary (outlined), danger, ghost. Height 48 (default) / 56 (hero). Radius `md`. Loading + disabled states. |
| `Card` | Surface bg, `shadow-card`, radius `lg`, padding `space-4`. |
| `StatusChip` | Pill, 12px semibold, icon + label. Variants: scheduled, in-progress, completed, missed, verified, needs-review, pending-sync, offline. |
| `ConnectionBanner` | Slim top banner. Offline = `offline-bg`; syncing = `info-bg`; sync error = `warning-bg`. Tappable to open the Sync screen. |
| `BottomSheet` | Slides up, `shadow-sheet`, drag handle, max 85% height, backdrop. |
| `Timer` | Large tabular-numerals elapsed time (`hh:mm:ss`). |
| `EmptyState` | Icon, title, one line help, optional action. |
| `Skeleton` | Gray shimmer blocks for loading. |
| `Toast` | Bottom, above tab bar, auto-dismiss 4 s. |
| `FormField` | Label above, 48px input, inline error text. |
| `Table` (admin) | Sticky header, sortable columns, row hover, responsive horizontal scroll container. |
| `MapPicker` (admin) | Click-to-drop pin, radius circle preview, address search. Use a free tile provider (OpenStreetMap via Leaflet) to avoid API costs. |

Icons: **lucide**. Motion: 150 to 200 ms ease-out; respect `prefers-reduced-motion`.

### 10.4 Copy tone
Short, calm, plain language. No jargon.
Examples: "You are checked in." / "Saved. Will sync when you're online." / "Needs review" (never "Failed verification").

---

## 11. Nurse app: screens (mobile wireframes)

Legend: `[ ]` button, `( )` chip, `▓` primary color area.

### 11.1 Login
```
┌────────────────────────────┐
│                            │
│        [ Logo ]            │
│      Welcome back          │
│  Sign in to see your day   │
│                            │
│  Email                     │
│  [______________________]  │
│  Password                  │
│  [______________________]  │
│                            │
│  [▓▓▓▓▓ Sign in ▓▓▓▓▓▓▓]   │
│       Forgot password?     │
└────────────────────────────┘
```
- Persist session. Works offline once logged in.
- Android build shows nothing different. iOS PWA shows a one-time "Add to Home Screen" hint (Section 11.10).

### 11.2 Today (home tab)
```
┌────────────────────────────┐
│ ⚠ Offline · 2 waiting      │ <- ConnectionBanner (conditional)
│ Good morning, Amina        │
│ Tue, 5 Jan                 │
│                            │
│ ┌────────────────────────┐ │
│ │ 09:00–10:00  (In prog.)│ │
│ │ Mary K.                │ │
│ │ 12 Palm St             │ │
│ │ ▓ 00:42:10 ▓           │ │
│ └────────────────────────┘ │
│ ┌────────────────────────┐ │
│ │ 11:00–12:00 (Scheduled)│ │
│ │ John D.        2.1 km  │ │
│ └────────────────────────┘ │
│ ┌────────────────────────┐ │
│ │ 14:00–15:00 (Scheduled)│ │
│ └────────────────────────┘ │
├────────────────────────────┤
│  Today   History  Profile  │
└────────────────────────────┘
```
- Sorted by start time. In-progress visit pinned on top.
- Empty state: "No visits today."
- Pull-to-refresh triggers a sync.

### 11.3 Visit detail
```
┌────────────────────────────┐
│ ←  Visit                   │
│ Mary K.         (Scheduled)│
│ 09:00 – 10:00              │
│                            │
│ Address                    │
│ 12 Palm St   [Open in Maps]│
│                            │
│ Instructions               │
│ Ring bell twice. Gate code │
│ in notes.                  │
│                            │
│ Notes                      │
│ (none yet)                 │
│                            │
│ [▓▓▓▓▓▓ Arrive ▓▓▓▓▓▓▓▓]   │
└────────────────────────────┘
```
- Primary button changes with state: **Arrive** -> **Leave** -> (completed: none).
- "Open in Maps" uses a `geo:`/maps URL.

### 11.4 Arrive confirmation (bottom sheet)
```
┌────────────────────────────┐
│ ──                         │
│ Check in at Mary K.?       │
│ 📍 Getting your location…  │
│    (or) Location found     │
│    Accuracy: good          │
│                            │
│ [▓▓ Confirm arrival ▓▓▓▓]  │
│ [ Cancel ]                 │
└────────────────────────────┘
```
- Confirm is enabled immediately (never block). If location is not ready, label stays "Confirm arrival" and a small note says "Location will be saved if available."
- On confirm: write locally, vibrate lightly, show toast "You are checked in.", switch to Active Visit.

### 11.5 Active visit
```
┌────────────────────────────┐
│ Mary K.    (In progress)   │
│                            │
│        00:42:10            │
│   Arrived 09:02 · Verified │
│                            │
│ Quick note                 │
│ [______________________]   │
│ [ + Add note ]             │
│                            │
│ [▓▓▓▓▓▓ Leave ▓▓▓▓▓▓▓▓▓]   │
└────────────────────────────┘
```
- Timer is computed from the stored `device_time`, not a running counter, so it survives app restarts.

### 11.6 Leave confirmation (bottom sheet)
Shows total time, optional final note, then **Confirm departure**. After confirm: visit becomes Completed, return to Today with toast "Visit saved."

### 11.7 History tab
List of past visits grouped by date, each with client, duration, and chip (Verified / Needs review / Pending sync). Tap for read-only detail.

### 11.8 Sync screen (from banner or Profile)
```
┌────────────────────────────┐
│ ← Sync                     │
│ Last synced: 10:41         │
│ [ Sync now ]               │
│                            │
│ Waiting to send (2)        │
│  · Check-in · Mary K.      │
│  · Note · Mary K.          │
│                            │
│ Needs attention (0)        │
└────────────────────────────┘
```
Items in "Needs attention" show a plain reason and a "Contact admin" hint.

### 11.9 Profile / Settings
Name, email, app version, **Sync**, **Permissions help**, **Check for update** (Android), **Log out** (warn if outbox is not empty: "You have unsent items. Logging out now would lose them." Block log out until synced, or require explicit confirmation).

### 11.10 Onboarding and permissions
1. **Location explanation screen** (before the OS prompt): why location is used, when it is captured (only at arrive/leave in PWA; optionally in background in Android app), what admins can see.
2. iOS PWA: instructions to "Add to Home Screen" with a simple 3-step illustration.
3. Android app: prominent disclosure for background location, then guided steps to "Allow all the time" and disable battery optimization.

### 11.11 Update prompt (Android)
Banner/sheet when `app_version < latest`; **blocking** screen if `< min_supported_version`.

### 11.12 Photo proof (v1.1)

```
┌────────────────────────────┐
│ Mary K.    (In progress)   │
│        00:42:10            │
│                            │
│ Photos (2 of 5)            │
│ [▢ ✓] [▢ ⏳]  [ + Add ]    │
│                            │
│ ✓ uploaded  ⏳ pending     │
│                            │
│ [▓▓▓▓▓▓ Leave ▓▓▓▓▓▓▓▓▓]   │
└────────────────────────────┘
```
- Before the **first photo of the day**, show the admin-configured guidance text once (e.g. what is appropriate to photograph) with an "I understand" button.
- Hidden entirely when the client has `photo_allowed = false`.
- If the setting `photo_required_on_checkout` is on, Leave stays disabled until at least one photo exists, with the message "Add a photo to finish this visit."
- Retake and delete are allowed only **before** the photo is registered on the server. After that it is permanent (admins can hide with an audited action).

### 11.13 Start unscheduled visit (only when the feature is on, v1.1)

```
┌────────────────────────────┐
│ Today                      │
│ ...                        │
│  [ + Unscheduled visit ]   │  <- only if allowed
│                            │
│ ▼ sheet                    │
│ Who did you visit?         │
│ ( ) Mary K.                │
│ ( ) John D.                │
│ [▓▓ Start visit ▓▓▓▓▓▓▓]   │
└────────────────────────────┘
```
- Choose only from the nurse's assigned clients. No free text.
- Starts a visit with `adhoc = true` and an immediate check-in. The supervisor sees it flagged for review.
- Hidden whenever the setting is off. If it was turned off while offline, the sync is rejected and surfaced in "Needs attention".

---

## 12. Admin additions: screens

Keep the existing admin look and navigation. Add a new nav group **"Care Operations"** behind a feature flag.

### 12.1 Nurses
- Table: name, phone, status, last seen, app version, last sync.
- Actions: invite (email), deactivate, reset access.
- Detail: profile + recent visits.

### 12.2 Clients and locations
- Table of clients; detail page with location(s).
- **Location editor**: address text, `MapPicker` with pin + radius circle, radius input (default 150 m). Warning if geocoding is uncertain.

### 12.3 Schedule
- Week/day list view (calendar view is optional, later).
- Create visit: client, location, nurse, start/end, instructions.
- Reassign and cancel with confirmation. Changes sync to nurse devices on next pull.

### 12.4 Visits
- Filter bar: date range, nurse, client, status, verification, flagged only.
- Table columns: date, nurse, client, scheduled, actual in/out, duration, verification chip, source, flags count.
- **Visit detail**: timeline of events (check-in, notes, check-out), map showing client pin, radius circle, and event pins; distance and accuracy values; flags with Resolve action; audit trail; Annotate button.

### 12.5 Flags queue
Prioritized list of unresolved flags. Resolve requires a short note. Bulk-resolve not in v1.

### 12.6 Reports
Date range + nurse + client filters, summary cards (total visits, total hours, % verified, flagged count), table, **Export CSV**.

### 12.7 Settings
Default radius, max accuracy, short/long duration thresholds, Android release record (version, min version, download link).

### 12.8 Super admin settings (v1.1)
- Toggle **Allow ad hoc visits** (global) plus optional per-nurse override on the nurse detail page.
- Photo rules: max photos per visit, require photo at checkout, guidance text shown to nurses.
- Geofence defaults and thresholds (Section 9).
- Retention settings (16.1).
- Manage admins and supervisors.
- Every change is audited with who, when, before and after.

### 12.9 Supervisor view (v1.1)
- Same Visits, Flags, Reports and Schedule screens, automatically **scoped to the supervisor's team**.
- "My team" page: nurses with today's status (not started, in progress, completed, flagged).
- Schedule creation only offers the supervisor's own nurses and clients.

### 12.10 Client locations and stays (v1.1)
- On a client's page, a timeline of stays: "Hospital X (3 Jan to 12 Jan)", "Home (12 Jan to now)".
- **Move client** button: choose location (or create one with `MapPicker`), start date, reason. Future scheduled visits can optionally be re-pointed to the new location. Past visits never change.

---

## 13. Public site changes
Minimal: **none required.** Optionally add a discreet "Staff login" link in the footer pointing to `app.site.com`. Do not change SEO-critical pages. Confirm `robots.txt` and sitemap exclude admin/app subdomains.

---

## 14. Native wrapper (Capacitor), Phase 7

- Add Capacitor to `apps/nurse`. Same React build output.
- Platform helper: `isNative = Capacitor.isNativePlatform()`.
- **Location adapter** interface in `lib/location`:
  - `getCurrentPosition()` -> `{lat,lng,accuracy,time}`
  - `startBackgroundWatch()` / `stopBackgroundWatch()` (native only)
  - Web implementation uses `navigator.geolocation`; native uses a maintained Capacitor background-geolocation plugin. `[FILL IN: pick plugin at implementation time and verify it is maintained]`
- Android manifest permissions: fine + background location, foreground service (location type), notifications.
- Keep the PWA working. The same screens run on both; native adds automatic arrival prompts and background capture.
- Signing: **one release keystore, backed up in at least two safe places.** Losing it forces every nurse to reinstall.
- Build output: signed **APK** for Firebase App Distribution.

---

## 15. Distribution (low-cost plan)

| Audience | Method | Cost |
|---|---|---|
| iPhone nurses | PWA at `app.site.com`, "Add to Home Screen" | $0 |
| Android nurses | APK via **Firebase App Distribution** (invite by email, install via link or tester app, update notifications) | $0 |
| Later, optional | Google Play internal testing track | $25 once |
| Later, optional | iOS TestFlight / custom app | $99/year |

Firebase notes: Firebase is used here **only to deliver the APK**. It is not your backend or database, and no other Firebase product is required. Tester limits (about 500 per project and 200 per group, with free increases on request) are far above what a nursing team needs. Nurses must allow installs from unknown sources and may see a Play Protect prompt, so provide a one-page install guide with screenshots.

**Fallback without Firebase:** store the signed APK in private storage and serve it through an authenticated FastAPI endpoint (short-lived signed link). The app's `/app/version` check then drives update prompts. More work than Firebase, but zero extra accounts.

**Ownership (important):** the Android keystore and the Firebase/Google account will start in the developer's name. Create the Firebase project under a **company-owned Google account**, store the keystore file and passwords in a shared company password vault (with the developer holding a copy, not the only copy), and document the handover steps. A lost keystore means every nurse must uninstall and reinstall.

---

## 16. Security and privacy

- HTTPS only. Short-lived access tokens + refresh. Secure storage of tokens (Keychain/Keystore in native; careful storage in PWA).
- Server-side role checks on **every** endpoint. Row-level rules so a nurse can only read their own visits.
- Validate all payloads on the server (schema validation). Reject events for visits not assigned to that nurse.
- Rate-limit auth and sync endpoints.
- Store the minimum client data on devices. **Do not cache sensitive medical notes offline** unless explicitly required. `[FILL IN: what client data nurses must see]`
- Offline data on device: clear on logout **only after** the outbox is empty (or the user explicitly confirms discarding it).
- Location data is personal data. Add a short **privacy notice** and nurse consent screen. Define retention (e.g. keep raw coordinates N months). See 16.1 for the Uganda requirements.
- Audit log for admin corrections and flag resolutions.
- Admin and nurse apps: `X-Robots-Tag: noindex`, no sitemap, security headers (CSP, frame-ancestors none).
- Backups for the database and the Android keystore.
- If real patient health data is handled, confirm hosting/vendor compliance requirements with a Ugandan lawyer before launch (16.1).

### 16.1 Uganda: Data Protection and Privacy Act, 2019 (DPPA)

> This is an engineering checklist, not legal advice. A Uganda-qualified lawyer should review the notices, consent text, retention periods and the treatment of any health-related information.

**Organization tasks (not code):**
1. **Register** the organization with the Personal Data Protection Office (PDPO, under NITA). Registration is required under section 29 of the Act and describes the personal data processed, the purpose, the data protection officer, transfers outside Uganda, and security measures. An annual compliance report follows.
2. **Appoint a data protection officer / contact person.**
3. Write: privacy notice, data retention policy, breach response procedure.
4. **Breach duty:** if unauthorized access to personal data is reasonably suspected, the PDPO must be notified promptly. Keep an incident runbook.
5. **Cross-border processing:** MongoDB Atlas, Cloudinary and Vercel (and Firebase if used) may store or process data outside Uganda. List them in the registration, make sure adequate protection or consent applies, and pick the nearest suitable region where possible.
6. Seven principles to design against: lawfulness and fairness, purpose limitation, data minimization, accuracy, storage limitation, integrity and confidentiality, accountability.

**Product requirements (code):**
- Show the **privacy notice and location consent** at first login. Store acceptance in `consents` (user, version, timestamp). Re-prompt when the version changes.
- **Data minimization:** nurses receive only client name, location, time and short instructions (already a decision in 0.5). Do not add fields to nurse payloads without approval.
- **Photos are personal data.** Per-client `photo_allowed` flag, guidance text before the first photo, signed (non-public) delivery URLs, and an audit log entry for every admin view of a photo.
- **Retention job:** scheduled task that removes or anonymizes raw coordinates and photos older than the configured periods. Defaults `[FILL IN: decide with lawyer]`.
- **Data subject requests:** an admin procedure to export, correct, or anonymize one client's data (including photos in Cloudinary), logged in `audit_log`.
- Encryption in transit (HTTPS) and at rest (Atlas default). Secrets only in environment variables.

### 16.2 Backups (replicates the BallotBox design)

**Design (confirmed):**
1. **Main database:** MongoDB Atlas.
2. **Scheduled backup job:** dumps the database, compresses it, and uploads it to a **Backblaze B2 bucket with Object Lock (immutable)**, so backups cannot be altered or deleted during the retention period, even by a compromised server.
3. **Second MongoDB database (separate account/cluster)** has two jobs: it holds a **rolling copy** of current data, and it is the **restore-test target**.
4. **Restore verification:** on a schedule, the latest B2 backup is restored into the second database and a script compares document counts and checksums (especially for append-only collections like `visit_events`). The result is reported to the developer (email/SMS) and logged.

**Implementation requirements**
- Backup job: `mongodump` (or equivalent) -> gzip -> **encrypt before upload** (key stored separately from B2 credentials) -> upload -> write a manifest `{ timestamp, collections, counts, sha256, size }` -> alert on any failure. Frequency: nightly full by default (variable). Optionally hourly incremental for append-only collections.
- Retention (variables, defaults): 30 daily, 12 weekly, 12 monthly via B2 lifecycle rules and Object Lock periods.
- **Separate credentials:** B2 key for backups is write-only (cannot delete). A different restore key is kept offline. The dump user in MongoDB is read-only.
- Targets (variables): RPO 24 hours, RTO 4 hours. Write a one-page **restore runbook** and rehearse it.
- Monthly human check: restore a backup and open the app against it.

**MongoDB Atlas free tier (M0) is not suitable for production.** Per the Atlas documentation and pricing page: 512 MB storage, no backups, a cap of 100 operations per second, 500 connections, a data transfer limit per rolling seven days (10 GB in and 10 GB out), and Atlas may terminate idle free clusters. Consequences for this project:
- Fine for development and a very small pilot with test data.
- With many nurses syncing and dashboards polling, 100 ops/sec and 512 MB will be hit. Upgrade to a paid dedicated tier **before real data and before the pilot grows**. Paid tiers add Cloud Backup, more storage and throughput. Keep the B2 pipeline anyway as an independent copy.
- The backup dump counts toward M0 transfer limits. Run it off-peak.
- Make the tier a recorded decision: Phase 8 gate requires the production database to be off M0.

**Photos (Cloudinary, free plan)**
- Photos are not in MongoDB. Mongo keeps metadata (`public_id`). A scheduled job downloads new originals from Cloudinary and stores them in the **same immutable B2 bucket**, keeping a manifest of public IDs and checksums.
- The Cloudinary free plan is credit-based with storage, bandwidth and transformation limits that change over time. `[FILL IN: verify current limits and set an alert at 70% usage]`. Compress on the phone (Section 8.5) to stay within limits.

**Also back up:** the Android keystore, environment secrets (in a vault), and the repository.

### 16.3 PDPO registration checklist (nurse app and BallotBox)

> Organization tasks, done by the business owner with the developer's help. Not legal advice. Fees and forms change, so confirm everything on the PDPO portal (https://pdpo.go.ug/register) before paying.

**A. Decide who the data controller is**
- [ ] Name the legal entity that owns the data for the nurse app. Name the entity that owns the data for BallotBox. If they are different organizations, each registers separately.
- [ ] Record the developer's role for each system (data processor acting for the controller, or controller) and put it in a short written agreement.

**B. Gather before applying**
- [ ] Corporate email address for the portal account (not a personal one). PDPO uses it for renewals and annual compliance notices.
- [ ] Description of personal data per system:
  - Nurse app: nurse identity and contact details, client name, client locations, GPS coordinates at check-in/out, timestamps, visit photos.
  - BallotBox: voter/participant identity data and any data about votes cast. Treat as sensitive (political opinion). `[FILL IN: exact fields]`
- [ ] Purpose of processing for each system, in one or two plain sentences.
- [ ] Data protection officer / contact person name and email.
- [ ] Where data is stored and processed outside Uganda: MongoDB Atlas (region), Cloudinary, Vercel, Firebase (if used). Note the cross-border undertaking (Form 3).
- [ ] Information security / data protection policy (short document: access control, encryption, backups, incident response, retention).
- [ ] Retention policy (how long coordinates, photos, voter data are kept).
- [ ] Breach response procedure (who notifies the PDPO and how quickly).

**C. Apply**
- [ ] Create the portal account and verify the email.
- [ ] Submit the application (Form 2), the cross-border undertaking (Form 3), and the policy document.
- [ ] Pay the registration fee and attach proof of payment (fee last seen around UGX 100,000, verify).
- [ ] Respond to any PDPO queries (often about cross-border transfers and safeguards).
- [ ] Save the registration certificate.

**D. After registration**
- [ ] Diary the **annual renewal** and the annual compliance report.
- [ ] Re-register or amend when a system, purpose, or storage location changes (e.g. adding a new vendor outside Uganda).
- [ ] Keep the privacy notice, consent records (`consents` collection), retention job logs and the breach register up to date.

**E. Who to ask for guidance**
- The PDPO itself (see the Contact section of the portal). It issues registration classification and guidance notes and offers technical guidance to registered organizations.
- A Ugandan lawyer only for the specific questions that need one: controller/processor roles between you and your clients, consent wording, and the BallotBox sensitive-data review. A one-hour review is usually enough once the checklist above is filled in.

---

## 17. Phased plan with acceptance criteria

> Each phase is shippable on its own. Existing public site and admin must keep working after every phase.

### Phase 0: Discovery and audit (no code changes)
**Tasks:** Inspect the repo. Document: framework/versions, folder layout, how admin is built and authenticated, backend/DB type, hosting setup, environment variables, existing design tokens/brand.
**Output:** a short `docs/audit.md` and filled-in `[FILL IN]` values for this spec.
**Done when:** the human confirms the audit is accurate.

### Phase 1: Monorepo foundation and design tokens
**Tasks:** Introduce workspaces without moving existing apps if risky. Create `packages/ui` (tokens + base components), `packages/types`, `packages/geo`, `packages/config`. Create empty `apps/nurse` with Vite + React + TS + routing + PWA plugin + token styles + a placeholder home page. Create the third Vercel project pointing to `apps/nurse`.
**Done when:** public site and admin build and deploy exactly as before; `app.site.com` shows the placeholder with correct fonts/colors; CI builds all apps.

### Phase 2: Backend additions (additive only)
**Tasks:** Collections, validators and indexes for Sections 6 and 6.3 (MongoDB, no SQL migrations). Role handling (`nurse`, `supervisor`, `super_admin`) and supervisor scoping helper. Consent endpoint. Row-level/permission rules. Implement `GET /me`. Seed script with demo nurse, client, location, visits. Feature flags table or config.
**Done when:** a seeded nurse can log in via API and `/me` returns role + config; an unauthorized read of another nurse's visit is rejected (tested).

### Phase 2B: Settings framework and setup checklist
**Tasks:** Implement the settings system in Section 25: schema-driven settings with defaults, scope resolution (client over team over organization over default), audit of every change, admin screen generated from the schema, resolved settings returned by `GET /me`, and the **Go-live readiness checklist**. Include module flags (B, C, D default off).
**Done when:** changing a setting in the admin UI changes app behavior without a deploy, an unset optional setting falls back to its default, and the readiness checklist lists what is still unset.

### Phase 3: Admin: read/manage foundations (flagged)
**Tasks:** Under flag, add Nurses (with supervisor assignment), Clients + Locations + Stays (with `MapPicker`), Schedule (create/assign visits, supervisor-scoped), and the super admin settings page with the ad hoc toggle (default off). No reporting yet.
**Done when:** an admin can create a client with a map-pinned location, create a nurse, and schedule a visit; existing admin features untouched.

### Phase 4: Nurse app (online-only MVP, PWA)
**Tasks:** Login, shell with bottom tabs, Today, Visit detail, Arrive/Leave sheets, Active visit, History, Profile. Calls API directly (no offline yet). Browser geolocation. Server computes verification and flags.
**Done when:** a nurse on a phone can log in, see assigned visits, check in and out, and the admin can see the resulting events with distance and verification. The app meets the performance budget in Section 26 on a throttled low-end profile.

### Phase 5: Offline-first and sync
**Tasks:** Dexie schema, local-first reads, outbox, `/sync/pull` and `/sync/push`, idempotency, retry/backoff, ConnectionBanner, Sync screen, safe logout rules, Workbox app-shell caching, PWA manifest + install prompts, persistent storage request.
**Done when (manual tests):** airplane mode check-in/out works and syncs on reconnect with no duplicates; killing the app mid-visit keeps the timer correct; token expiry while offline does not lose queued items; duplicate push returns `duplicate` and is handled.

### Phase 5B: Photo proof and optional ad hoc visits
**Tasks:** Cloudinary signed upload, offline photo queue (Section 8.5), photo UI (11.12), admin photo gallery with signed URLs and audit logging, `photo_allowed` per client, max photo and required-at-checkout settings. Ad hoc visit flow (11.13) behind the super admin toggle.
**Done when:** photos taken offline upload and register exactly once after reconnect; unauthorized users cannot fetch photo URLs; turning the ad hoc toggle off hides the button and rejects queued ad hoc visits cleanly.

### Phase 6: Admin visits, flags, reports
**Tasks:** Visits table + detail (timeline + map), Flags queue, Annotate/Resolve with audit, Reports + CSV export, Settings (geofence thresholds).
**Done when:** admin can answer "who was where, when, for how long, and was it verified" for any date range and export it.

### Phase 7: Capacitor Android app
**Tasks:** Add Capacitor + Android project. Location adapter (web/native). Permission onboarding + prominent disclosure. Optional background capture and arrival prompt. Version check endpoint + update prompt UI. Signed APK build instructions.
**Done when:** APK installs on at least 3 different Android brands, background location survives screen-off for a full visit, source field shows `app_auto` where applicable, and the PWA still works.

### Phase 8: Distribution and rollout
**Gate (must pass before starting):** PDPO registration confirmed for the controller of this system (Section 16.3), privacy notice and consent screen live, retention policy written. No real nurse or client data enters the system before this. The production database is **off the free M0 tier** (16.2), and the B2 backup pipeline and a restore test have passed.
**Tasks:** Firebase App Distribution setup, tester group, install guide for nurses (PDF/page), iOS PWA install guide, pilot with 2 to 3 nurses for 1 to 2 weeks, collect issues.
**Done when:** pilot nurses complete real visits; issues triaged; go/no-go decision documented.

### Phase 9: Hardening
**Tasks:** Security review checklist (Section 16), PDPO registration and compliance items (16.1), privacy notice + consent live, retention job, backup restore drill (16.2), error monitoring, performance pass, accessibility pass, keystore and account ownership handover, documentation handover.
**Done when:** checklist signed off by the human, PDPO registration confirmed, and a restore drill has passed.

### Phase 10: Timesheets (Module B, part 1)
**Tasks:** Section 22.2. Auto-generated timesheets from verified visits, nurse submit, supervisor approve/reject, adjustments with audit reason, CSV export.
**Done when:** a week of test visits produces correct totals, an unapproved sheet cannot be exported as final, and every adjustment is audited.

### Phase 11: Executive dashboard and exception alerts (Module B, part 2)
**Tasks:** Sections 22.3 to 22.5. Dashboard (team and organization views), alert rules engine (scheduled job), alert states and escalation, SMS provider integration for critical alerts, "last seen" freshness display.
**Done when:** simulated late, missed and idle scenarios each raise exactly one alert, deduplicated, delivered to the right people, acknowledged, and escalated when ignored.

### Phase 12: Safety / SOS (Module C)
**Tasks:** Section 23. May be pulled forward to follow Phase 5 (online SOS in the PWA) with the SMS fallback added after Phase 7.
**Done when:** the full drill in 23.6 passes with real phones, real responders and real SMS delivery, and a written response procedure exists.

### Phase 13: Patient profiles and care logging (Module D, GATED)
**Gate:** all items in 24.1 complete and signed off by the human. Do not start otherwise.
**Tasks:** Section 24.
**Done when:** medication and care-task logging works offline, "not recorded" alerts fire correctly, device security (PIN lock, encrypted local storage, remote sign-out) is verified, and read access to patient data is audit-logged.

---

## 18. Prompt template for each phase (copy/paste to the implementing model)

```
You are implementing Phase <N> of docs/this-spec.md.

Rules:
- Read Sections 0, 2, and the sections referenced by this phase.
- Do ONLY Phase <N>. Do not start later phases.
- Do not modify existing public/admin behavior unless this phase says so.
- Follow the design tokens and components in Section 10 exactly.
- If anything is ambiguous or marked [FILL IN], ask me before coding.

Context from the codebase audit: <paste docs/audit.md>

Deliver:
1. Plan (files to create/change) for my approval.
2. Implementation.
3. A test checklist I can run by hand.
4. A list of anything intentionally not done.
```

---

## 19. Test checklist (cumulative)

**Functional**
- [ ] Nurse can log in, sees only own visits.
- [ ] Arrive -> Leave produces two events, correct duration.
- [ ] Verification result matches the rules in Section 9 for: inside radius, outside radius, low accuracy, no location.
- [ ] Admin sees events, map, flags, and can resolve with a note.

**Offline**
- [ ] Airplane mode: arrive, note, leave. Reconnect: everything syncs once.
- [ ] Kill app during visit: timer and state restore.
- [ ] Duplicate push is harmless.
- [ ] Logout with pending items is guarded.
- [ ] Token expires offline: queue preserved.

**Security**
- [ ] Nurse A cannot read/write Nurse B's data via direct API calls.
- [ ] Nurse cannot call `/admin/*`.
- [ ] Forged client coordinates cannot override server verification rules.
- [ ] Admin/app subdomains are `noindex`.

**Devices**
- [ ] iPhone Safari PWA installed to home screen.
- [ ] 3+ Android brands for the Capacitor build.
- [ ] Low-end phone, poor network, battery saver on.

**Design**
- [ ] 360px and 430px widths look correct; safe areas respected.
- [ ] All tap targets at least 48px.
- [ ] Color contrast AA; state never conveyed by color alone.

---

## 20. Decisions log and remaining questions

### 20.1 Answered (see 0.5)
Framework (React + Vite SSG), backend (FastAPI), database (MongoDB, two accounts), auth (hand-rolled JWT, nurses reuse it), nurse data visibility (name, location, time), pagination (default), jurisdiction (Uganda), scheduling (supervisors), ad hoc visits (super admin toggle, default off), multi-location clients (stays over time), photos (Cloudinary), keystore/Firebase ownership (developer for now, handover planned), brand colors (undecided, placeholders), scale (unknown, tune later).

### 20.1b Answered (v1.3)
Roles and scopes do not exist yet (create from scratch). Login identifier undecided (configurable). Backups: B2 immutable storage plus second MongoDB database (rolling copy and restore test). Atlas is on M0 free (no automated backup; upgrade before production). Cloudinary free plan. English only. Devices: cover as many as possible, lowest around USD 100 class. Accounts owned by the developer for now, transferable. Photo rules, thresholds, timesheet periods and approvers: all variables set at go-live. Consent: handled in the signed agreement, with a consent reference stored in the system. SMS: Mambo SMS. On-call: to be consulted, ready-made roster feature and procedure template provided.

### 20.2 Still open (everything else is a variable set at go-live, Section 25)
1. **Code to review (Phase 0):** the developer will share the existing code. Send the repo without secrets (no `.env` files, keys, or tokens). Most useful: `package.json` files, the auth module, database models, deployment config, and folder tree.
2. **Mambo SMS details:** API documentation, authentication method, sender ID, whether delivery receipts and inbound SMS (replies) are supported, price per message.
3. **On-call roster:** names, phone numbers, coverage hours, response-time targets, and who is the escalation contact. (Needed before SOS is enabled.)
4. **Cloudinary:** confirm current free-plan limits, and the usage alert level.
5. **Atlas production tier and region:** decide when to leave M0 (recommended before the Phase 8 pilot).
6. **Clinical rules for Module D:** which regulations apply, and who authorizes medication lists and care plans (only needed when Module D starts).
7. **Consent template:** wording to include in the signed agreements (nurse location consent, client photo consent), reviewed by a lawyer.
8. **Brand colors and logo:** when available. Until then the placeholder tokens are used.

---

## 21. Out-of-scope ideas for later
Dark mode, calendar view, push notifications, signature capture, route optimization, payroll export, additional languages, SMS check-in fallback (nurse texts a code to a number when there is no data), iOS native app via TestFlight or custom distribution.

---

## 22. Module B: Timesheets, executive dashboard and exception alerts

### 22.1 Definitions (all configurable under `settings`, defaults shown)
| Term | Definition | Default |
|---|---|---|
| On time | Check-in within grace of `scheduled_start` | grace 10 min |
| Late | Check-in later than grace | > 10 min |
| Early arrival | Check-in earlier than start by more than the early window | > 15 min before |
| Missed check-in | No check-in by start plus missed threshold | 30 min |
| Idle (schedule-based) | Visit in progress, no logged action (note, photo, task, snap) for the idle window | 60 min |
| Overstay | Still in progress after `scheduled_end` plus overstay window | 30 min |
| Missed check-out | No check-out by `scheduled_end` plus window | 60 min |
| Short visit | Duration below a percentage of scheduled duration | < 50% |
| Out of range | Latest action snap outside the visit's radius | see 9.5 |
| Stale / quiet device | `last_seen_at` older than the threshold | 45 min during a visit |

**Important:** "quiet device" may simply mean no signal. The dashboard must show *last seen* and phrase it neutrally (e.g. "Last seen 38 min ago"), never "idle" or "absent" based on connectivity alone.

### 22.2 Timesheets
Collection `timesheets`: `id`, `nurse_id`, `period_start`, `period_end`, `entries` `[{ visit_id, client_label, check_in, check_out, minutes, verification, adjusted, adjust_reason }]`, `total_minutes`, `status` (`draft` | `submitted` | `approved` | `rejected`), `submitted_at`, `approved_by`, `approved_at`, `reject_reason`.
- Generated automatically from visit events (duration = check-out minus check-in, using the rules in Section 6.2). Nurses cannot type their own hours.
- Open or unverified visits are marked and must be resolved or explained before submit.
- Nurse reviews and **submits**. Supervisor **approves or rejects** (with reason). Admin/executive read.
- Adjustments by supervisors require a reason and write to `audit_log`.
- Export: CSV (and PDF later) per period, nurse, team. Approved sheets are locked.
- Nurse screen: list of periods, tap for daily breakdown, "Submit" at the bottom.

### 22.3 Dashboard
Two views, same data, different scope (by Section 5): **Organization** (executive, admin, super_admin) and **My team** (supervisor).

```
┌───────────────────────────────────────────────────────────┐
│ Today · Fri 5 Jan        As of 10:42 (auto-refresh 30 s)  │
├───────────────────────────────────────────────────────────┤
│ [On time 38] [Late 6] [Not started 4] [In progress 21]    │
│ [Completed 15] [Missed 2] [Alerts open 3] [SOS 0]         │
├───────────────────────────────────────────────────────────┤
│ Alerts needing action                                     │
│  ! Missed check-in · Amina K. · Mary K. · 38 min [Open]   │
│  ! Idle 72 min · Peter O. · John D.        [Open]         │
├───────────────────────────────────────────────────────────┤
│ Nurse        Visit       Status       Arrived  Last seen  │
│ Amina K.     Mary K.     In progress  09:02 ✓  10:40      │
│ Peter O.     John D.     In progress  09:30 ⚠  09:31      │
│ Grace N.     Esther L.   Late         —        10:20      │
│ [filters: team · status · date]        [Map view]         │
└───────────────────────────────────────────────────────────┘
```
- Cards are clickable filters. Rows open visit detail (timeline, snaps on a map).
- **Freshness is always shown** ("As of ..."). Auto-refresh by polling every 30 to 60 seconds. Upgrade to server-sent events later only if needed.
- Executive additional charts (weekly): punctuality %, verified %, average visit length, missed visits trend, alerts by type.
- Map view: today's nurses at last known snap, colored by status. Not live tracking. Each marker shows its time.
- Paginate nurse lists. Default page size 20.

### 22.4 Exception alerts engine
Collection `alerts`: `id`, `type`, `severity` (`info` | `warning` | `critical`), `visit_id`, `nurse_id`, `team_id`, `created_at`, `status` (`open` | `acknowledged` | `resolved`), `acknowledged_by`, `resolved_by`, `resolved_note`, `dedupe_key`, `escalation_level`.
- A **scheduled job** (every minute) evaluates rules against schedules, visits and last-seen data. Rules are configurable in `settings`.
- **Dedupe:** one open alert per `dedupe_key` (e.g. `missed_checkin:{visit_id}`). Auto-resolve when the condition clears (e.g. late check-in arrives), keeping history.
- **Alert types:** `missed_checkin`, `late_checkin`, `missed_checkout`, `overstay`, `idle`, `out_of_range`, `quiet_device`, `short_visit`, `sos` (critical, Module C), `missed_care_task` (Module D), `sync_stuck` (outbox items rejected or very old).
- **Delivery:** dashboard (all), push notification (later), **SMS for critical severity and for warnings unacknowledged after N minutes**. Store each delivery in `notification_log` (provider status, cost).
- **Escalation:** supervisor first. If not acknowledged within the configured time, escalate to admin, then executive. Escalation chain is configurable per team.
- Quiet hours apply to `info` and `warning` only. `critical` always delivers.

### 22.5 Care-task alerts (activates with Module D)
`missed_care_task` fires when a task's `due_at` plus grace has passed with no log. The wording is always "**not recorded**", never "not given", because the system cannot know whether care happened.

---

## 23. Module C: Safety / SOS

**Purpose:** let a nurse in danger raise an alarm quickly, and make sure someone responds. This is a record-and-notify tool. It does **not** replace calling emergency services, and the app must say so.

### 23.1 Nurse experience
```
┌────────────────────────────┐
│ Mary K.    (In progress)   │
│ ...                        │
│                      ┌───┐ │
│                      │SOS│ │  <- always visible, red, bottom corner
│                      └───┘ │
└────────────────────────────┘

Press and HOLD 2 seconds
┌────────────────────────────┐
│  Sending alert in 5…       │
│  [ Cancel — I'm safe ]     │
└────────────────────────────┘

After send
┌────────────────────────────┐
│ ✓ Alert sent to supervisor │
│   Help is being notified.  │
│ [ Call emergency number ]  │
│ [ I'm safe now ]           │
└────────────────────────────┘
```
- Visible on Today, Visit detail and Active visit screens. Hold-to-send plus a short cancel window to prevent accidents.
- After sending, the screen shows only: status, **Call** button (supervisor and the configured emergency number via `tel:`), and **I'm safe now**.

### 23.2 What happens on send
1. Capture a quick fix (about 5 s timeout) and fall back to the last known snap. Create an `sos_events` document with a client UUID.
2. **Online:** `POST /sos` immediately (highest priority, ahead of the outbox queue).
3. **Offline, Android app:** retry data for about 10 s, then send an **SMS** with name, time and location link to the configured emergency numbers.
4. **Offline, iPhone PWA:** cannot send automatically. Show **Call** and an `sms:` link prefilled for the nurse to send, and keep retrying the API in the background while the app is open.
5. After an SOS, optionally enable **live follow mode**: a location ping every 30 s for up to a configured time (default 30 min), clearly indicated to the nurse, ending on "I'm safe now" or timeout.

### 23.3 Server handling
- Creates a `critical` alert at once and delivers via dashboard (full-width banner and sound), SMS, and push.
- Message contains: nurse, phone, client label and address, map link, time, battery, last snaps.
- **Escalation:** supervisor, then admin, then executive, with short timers (default 2 minutes) until someone **acknowledges**. A responder can add notes, call the nurse, and mark **resolved** with an outcome.
- Everything is timestamped in `audit_log`. SOS events are never deletable.

### 23.4 Lone-worker safety timer (server-driven)
- At check-in a nurse can start a **safety timer** (default: scheduled end plus 15 min).
- If the nurse neither checks out nor confirms "safe" by the deadline, the **server** raises a `missed_checkout` safety alert even if the phone is dead or offline. No dependence on the app running.
- Optional "Are you OK?" notification shortly before the deadline.

### 23.5 Operational requirements (not code, but required)
- A written **SOS response procedure**: who is on call, how fast they respond, what they do, when to call police or medical services (verify current Uganda emergency numbers).
- A **test mode** so drills create tagged test events without real escalation costs.
- **Monthly drill** with a real phone, delivery check of SMS and push, and response-time log.
- Clear in-app and training message: "SOS notifies your supervisor. In immediate danger, also call the emergency number."
- Nurses are told what is captured (location during SOS, live follow mode) in the privacy notice.

### 23.6 Acceptance drill (Phase 12)
- [ ] SOS on Wi-Fi: supervisor sees banner and SMS within 10 s.
- [ ] SOS with data off (Android): SMS fallback arrives.
- [ ] SOS offline iPhone PWA: call/SMS prompts shown, API retried on reconnect.
- [ ] Unacknowledged SOS escalates on schedule.
- [ ] Cancel within the window sends nothing.
- [ ] Safety timer expiry with a dead phone alerts the supervisor.
- [ ] Test mode does not escalate to real recipients.

---

## 24. Module D: Patient profiles and care logging (GATED)

> **Do not start until 24.1 is complete.** This module stores health information on servers and on nurses' phones. It is the highest-risk part of the project.

### 24.1 Gate checklist
- [ ] Legal review (Ugandan lawyer) of treatment of health data, patient/family consent, photo consent, retention, and who may access what.
- [ ] PDPO registration describes health-related data and its purposes (Section 16.3 updated).
- [ ] Written clinical ownership: the client names who authorizes medication lists and care plans. The app is a **record-keeping aid, not clinical decision support**.
- [ ] Device security implemented (24.5).
- [ ] Penetration test or independent security review of the API and the apps.
- [ ] Backup and restore drill covering this data (Section 16.2), including photos.
- [ ] Incident and breach procedure rehearsed.

### 24.2 Data model (MongoDB)
- `patient_profiles`: `client_id`, minimal demographics, emergency contact, allergies, conditions summary, `history_entries` `[{ date, text, author_id }]`, `photo_allowed`, `consent` `{ type, given_by, date, version }`.
- `medications`: `id`, `client_id`, `name`, `dose`, `route`, `schedule` (times or interval), `start_on`, `end_on`, `instructions`, `prescriber`, `version`, `updated_by`.
- `care_plans`: `id`, `client_id`, `version`, `tasks` `[{ task_id, type (medication | feeding | hygiene | vitals | mobility | other), title, instructions, schedule, window_before_min, window_after_min, medication_id? }]`, `status`. Changes create a **new version**. Old versions are kept.
- `care_logs`: `id` (client UUID), `visit_id`, `nurse_id`, `client_id`, `task_id`, `plan_version`, `due_at`, `status` (`given` | `done` | `refused` | `not_applicable` | `missed_reason`), `reason`, `logged_at_device`, `server_received_at`, `geo_snap`, `value` (e.g. vitals), `client_op_id`. Append-only.
- `progress_photos` (reuse `photos` with `kind = progress`, scope `care_photos`): `body_area`, `caption`, `consent_ref`.

### 24.3 Nurse experience
```
┌────────────────────────────┐
│ Mary K.  Care plan today   │
│                            │
│ 09:00 Medication · Drug A  │
│        [Given] [Refused]   │
│ 09:30 Feeding              │
│        [Done]  [Not done]  │
│ 10:00 Vitals               │
│        [Record]            │
│ ✓ 08:55 Medication · B     │
│                            │
│ [ + Progress photo ]       │
│ [▓▓▓▓▓▓ Leave ▓▓▓▓▓▓▓▓▓]   │
└────────────────────────────┘
```
- Tasks sorted by due time, with window colors (due soon, overdue). "Refused" and "Not done" require a short reason.
- Medication list and plan are **read-only for nurses**. Only supervisors (clinical) edit, creating a new version.
- Each tap writes a `care_logs` entry with a `geo_snap` (Section 9.5), works offline, and syncs via the outbox.
- **Progress timeline** per patient (supervisor view): visits, tasks logged, vitals, photos, adherence summary, filterable by date.

### 24.4 Alerts
`missed_care_task` per 22.5, delivered to the supervisor, escalating if unacknowledged. Reports show adherence percentages per patient and nurse (aggregates only for non-clinical roles).

### 24.5 Device and data security (required before Module D ships)
- **App lock:** PIN or biometric after inactivity (default 2 min) and on app start.
- **Encrypted local storage** for care data (IndexedDB data encrypted with a key derived from the PIN; native secure storage in the Capacitor app). Document the limits of PWA storage.
- **Remote sign-out / wipe:** server can mark a device revoked, and the app clears local data on next contact. Offer "report lost phone" to supervisors.
- **Session timeout** and short-lived tokens.
- **Android:** block screenshots on patient screens (FLAG_SECURE).
- **Audit every read** of patient data (who, which patient, when), alongside writes.
- **Offline cache minimization:** cache only the next 24 to 48 hours of assigned visits' care data and purge after sync and visit completion.
- No patient data in push notifications, SMS, logs, or error reports.

### 24.6 Acceptance (Phase 13)
- [ ] Medication and task logging works offline and syncs exactly once.
- [ ] Nurse cannot edit medications or care plans.
- [ ] Admin, executive and super_admin cannot read clinical data (Section 5), only aggregates.
- [ ] Plan changes create new versions, and logs reference the version in force.
- [ ] A lost-phone test wipes cached patient data.
- [ ] Reads of patient data appear in the audit log.
- [ ] `missed_care_task` fires with "not recorded" wording and respects grace windows.

---

## 25. Configuration catalog and organization setup (variables)

**Principle:** anything the organization may want to decide later is a **setting**, not code. The app works with defaults from day one, and the organization fills in real values when they start using it.

### 25.1 How settings work
- Stored in `settings` documents: `{ key, value, scope: { level: "org" | "team" | "client", id }, updated_by, updated_at, version }`.
- **Resolution order:** client, then team, then organization, then the default in code. A setting can be overridden at a narrower level only when its definition allows it (column "Overrides").
- A **settings schema** in code defines each key: type, default, allowed values, who may edit (resource `settings` write), and whether it is required before go-live. The admin UI is **generated from this schema**, so adding a setting needs no UI work.
- Every change is audited (who, when, before, after). Only `super_admin` writes (Section 5).
- The nurse app receives its **resolved settings** from `GET /me` and caches them locally, so offline behavior follows the last known settings.
- Module flags (`module_b_enabled`, `module_c_enabled`, `module_d_enabled`) default to off.

### 25.2 Catalog (defaults)
| Key | Meaning | Default | Overrides |
|---|---|---|---|
| `auth.login_identifier` | `email`, `phone`, or `either` | `either` | org |
| `auth.password_reset` | `admin_issued`, `sms_otp`, `email_link` | `admin_issued` | org |
| `auth.session_days` | Refresh session length | 30 | org |
| `auth.lockout_attempts` | Failed logins before lock | 5 | org |
| `visits.adhoc_enabled` | Allow unscheduled visits | false | org, per nurse |
| `visits.checkin_without_location` | `allow`, `warn`, `block` | `allow` | org |
| `photos.required` | `none`, `arrival`, `departure`, `either`, `both` | `none` | org, team, client |
| `photos.min_per_visit` / `photos.max_per_visit` | Limits | 0 / 5 | org, team, client |
| `photos.wifi_only_upload` | Upload photos on Wi-Fi only | false | org (nurse may choose stricter) |
| `photos.guidance_text` | What to photograph, shown once a day | empty | org, client |
| `verification.radius_m` | Geofence radius | 150 | org, client location |
| `verification.max_accuracy_m` | Worst GPS accuracy accepted | 100 | org |
| `thresholds.late_grace_min` | Minutes after start still "on time" | 10 | org, team |
| `thresholds.early_window_min` | Early arrival window | 15 | org |
| `thresholds.missed_checkin_min` | Minutes late before "missed" | 30 | org, team |
| `thresholds.idle_min` | No logged action during a visit | 60 | org, team |
| `thresholds.overstay_min` | Past scheduled end | 30 | org, team |
| `thresholds.missed_checkout_min` | Past scheduled end, no check-out | 60 | org, team |
| `thresholds.short_visit_pct` | Below this % of scheduled time | 50 | org, team |
| `thresholds.quiet_device_min` | Device not seen during a visit | 45 | org |
| `timesheets.period` | `weekly`, `fortnightly`, `monthly` | `weekly` | org |
| `timesheets.week_start` | Day the period starts | Monday | org |
| `timesheets.approver` | `supervisor`, `admin`, `either` | `supervisor` | org, team |
| `timesheets.rounding_min` | Round durations (0, 5, 15) | 0 | org |
| `timesheets.break_deduction_min` | Auto-deducted break | 0 | org |
| `timesheets.include_travel` | Count travel time | false | org |
| `alerts.channels` | Delivery per severity (dashboard, SMS, push) | critical: dashboard+SMS | org |
| `alerts.escalation_minutes` | Time before escalating to the next person | 10 (SOS: 2) | org, team |
| `alerts.quiet_hours` | No `info`/`warning` delivery | none | org |
| `sms.enabled`, `sms.provider`, `sms.sender_id`, `sms.monthly_cap` | SMS control and cost limit | off | org |
| `sos.enabled` | Show SOS button to nurses | false (auto-blocked until a responder exists) | org, team |
| `sos.hold_seconds`, `sos.cancel_window_s` | Press-and-hold and cancel window | 2, 5 | org |
| `sos.follow_minutes` | Live follow mode length | 30 | org |
| `sos.safety_timer_after_end_min` | Default safety timer margin | 15 | org |
| `sos.emergency_numbers` | List of numbers shown on the SOS screen | empty | org |
| `retention.coordinates_months` | Keep raw coordinates | unset (required before go-live) | org |
| `retention.photos_months` | Keep photos | unset (required before go-live) | org |
| `retention.sos_months` | Keep SOS records | unset (required before go-live) | org |
| `care.*` | Module D variables (windows, vitals allowed, etc.) | unset | org |
| `branding.name`, `branding.logo`, `branding.colors` | Organization identity and token overrides | placeholders | org |
| `backups.*` | Schedule, retention, RPO/RTO targets | see 16.2 | developer only |

### 25.3 Setup checklist screen (admin)
A computed **Go-live readiness** page listing each required item with a status (set, default in use, missing). Blocking items before real use:
- Privacy notice version published and consent screen configured.
- Retention periods set.
- If SOS is on: at least one on-call responder, SMS enabled, emergency numbers set.
- At least one supervisor and a nurse-to-supervisor assignment.
- Timesheet period and approver chosen (or defaults accepted explicitly).
- Production database off M0 and a restore test passed (developer item).

---

## 26. Platform baseline: devices and performance

**Target devices:** low-end Android smartphones (around the USD 100 class: roughly 2 GB RAM, small screens, older Android versions) must be fully usable. Support as many models as possible. iPhones use the PWA.
- Set the minimum Android version after the Phase 0 review (aim for Android 8 or newer and a Chrome/WebView version that supports the PWA features used). On unsupported devices, show a clear "update your browser or Android System WebView" message instead of failing.
- Test on at least three real low-end phones and an emulated 4x CPU slowdown with a slow-3G network profile.

**Performance budgets**
- Initial JavaScript for the nurse app: about 200 KB gzipped or less, with route-level code splitting.
- Map libraries and charts load **only** on screens that need them (never in the nurse login or Today screens).
- Lists use pagination and virtualization when long. Avoid loading whole tables from IndexedDB.
- Compress images on the device (8.5). Cap pending photos and check free storage before saving.
- No continuous GPS or frequent background work (9.5). This protects battery on cheap phones.
- Show skeleton loaders and keep every tap responsive (under 100 ms to visible feedback).

**Connectivity:** assume intermittent 2G/3G. Sync is incremental and resumable, and payloads are small (batch ops, compress responses).

**Responders** (supervisors, on-call staff) may only have basic phones. Anything critical to them must work by **SMS and voice call**, not only the web dashboard (Section 27).

---

## 27. SMS and on-call

### 27.1 SMS provider (adapter pattern)
- One interface: `send(to, text, meta) -> { provider_id, status }`, plus optional `parse_delivery_receipt` and `parse_inbound`. First implementation: **Mambo SMS**. The provider can be swapped without touching business code. `[FILL IN: Mambo SMS API docs, authentication, sender ID, DLR and inbound support, price]`
- Phone numbers stored in E.164 form (`+256...`).
- Messages: keep to a **single GSM-7 SMS (160 characters)** where possible to control cost. **No patient names or health details** in any SMS. Use the nurse's name, a short visit code, and a link that requires login.
- Controls: monthly cost cap (`sms.monthly_cap`), per-recipient rate limit, retries with backoff, delivery status stored in `notification_log` with cost.
- Test mode: sends to a developer number, tagged `[TEST]`.
- Credentials only in environment variables.

### 27.2 On-call roster (feature, ready before SOS is enabled)
Collection `oncall_roster`: `id`, `scope` (org or team), `name`, `contacts` `[{ name, phone, role, priority }]`, `windows` `[{ days, start, end, timezone }]`, `overrides` `[{ from, to, replace_with }]`, `ack_timeout_s`.
- Admin screen to edit the roster. Shows **who is on call now** on the dashboard and warns about **coverage gaps** (hours with nobody on call).
- **Guard:** the SOS button is hidden from nurses until at least one active responder with a phone number exists, SMS is enabled, and emergency numbers are set (checked by the readiness checklist). The admin sees a clear reason why SOS is off.
- **Acknowledgement:** a responder acknowledges through the secure link (login required) **or**, if the SMS provider supports inbound messages, by replying `ACK <code>`. This works on basic phones. If neither is acknowledged within `ack_timeout_s`, escalate to the next contact, then call-out by SMS to the next level.
- Escalation order defaults: on-call contact, supervisor, admin, executive.

### 27.3 SOS response procedure template (to fill in with the organization)
```
SOS RESPONSE PROCEDURE  (version __ , date __ )

1. Who is on call and when ................. (link to roster)
2. Target response times
   - Acknowledge an SOS within ...... minutes
   - First contact with the nurse within ...... minutes
3. Responder steps
   a. Acknowledge the alert (link or SMS reply).
   b. Call the nurse. If no answer, call the client's number/contact (if any).
   c. If danger is confirmed or the nurse is unreachable: call emergency
      services ( numbers: ........ ) and share the location link.
   d. Send the nearest available colleague/supervisor if appropriate.
   e. Keep the alert open until the nurse confirms safe, or the outcome is recorded.
4. After the incident
   - Record outcome and notes in the alert.
   - Incident report to management within ...... hours.
   - Review lessons and update this procedure.
5. Drills
   - Frequency ...... (monthly recommended). Use test mode. Record response times.
6. Contacts for escalation: ........ (names, numbers)
```
The system never replaces calling emergency services. The nurse screen and the training material must say this plainly.

---

## 28. TO-DO: Website code review and Module E (Website requests inbox)

> **Status: OPEN.** Waiting for the developer to share the existing website code (public site, admin, FastAPI backend). Nothing in this section should be built until the code review below is done.

### 28.1 To-do list
- [ ] **Developer:** share the website code. Upload a zip of the repo without `node_modules`, `.git`, `.env` files, keys or tokens. If a zip is awkward, send: `package.json` files, the auth module, database models, the form and API files, deployment config, and the folder tree.
- [ ] **Code review (Phase 0):** analyze what exists and write `docs/audit.md` covering: framework versions, folder layout, how admin is built and authenticated, existing API routes and models, any contact or request form already saving data, deployment setup, environment variables, existing design tokens.
- [ ] **Decide integration points:** what can be reused (auth, admin shell, form components), what must be added, and what cannot be added safely without changes. Report conflicts, do not silently work around them.
- [ ] **Update this spec** with the findings: replace the remaining `[FILL IN]` items and adjust Phases 1 to 3 to match the real code.
- [ ] **Confirm** whether a request or contact form already exists and where it stores data.
- [ ] **Design and build Module E** below, after the audit.

### 28.2 Purpose
The public website becomes the front door for new clients. Visitors submit a **service request** on the website. The CEO and admins see requests in the admin app, contact the person, and convert accepted requests into **clients with a location**, ready for supervisors to schedule visits (Sections 7 and 12).

### 28.3 Flow
1. Visitor fills the **Request care** form on the public site.
2. Backend validates, stores the request, and notifies admins.
3. Admin sees it in the **Requests inbox**, opens it, and updates the status as they work it.
4. On acceptance, **Convert to client** pre-fills a new client and location (admin confirms the address and map pin), then the supervisor schedules visits.
5. Declined or duplicate requests are closed with a reason. Nothing is deleted.

### 28.4 Public form (website)
- Fields: full name, phone (required), email (optional), service needed (dropdown from a setting), area/location (text), preferred start date (optional), short message.
- **Consent checkbox** with a link to the privacy notice, mandatory. Store the consent version and timestamp with the request.
- A visible note: "Please do not enter medical details here."
- Protection: server-side validation, rate limiting per IP and per phone number, honeypot field, and a CAPTCHA only if spam appears (keep it light for low-end phones).
- Confirmation screen: "We received your request. We will contact you." No promise of response time unless the organization sets one.
- Must not harm SEO or speed: keep the form as a small lazy-loaded island on a statically generated page.

### 28.5 Data model (MongoDB)
`service_requests`: `id`, `reference` (short human code), `name`, `phone`, `email`, `service_type`, `area_text`, `preferred_start`, `message`, `consent` `{ version, accepted_at }`, `source` (`website` | `phone` | `walk_in` | `manual`), `status` (`new` | `contacted` | `assessing` | `accepted` | `declined` | `closed`), `assigned_to`, `notes` `[{ at, by, text }]`, `converted_client_id`, `closed_reason`, `ip_hash`, `created_at`, `updated_at`.
- Indexes: `{ status: 1, created_at: -1 }`, `{ assigned_to: 1, status: 1 }`, `{ phone: 1 }`.
- Pagination applies (default 20, max 100).
- Retention: `retention.requests_months` setting (unset until the organization decides). Anonymize closed requests after that period.

### 28.6 API
| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/public/requests` | anyone (rate limited) | Submit a request |
| GET | `/admin/requests` | requests: read | List and filter |
| GET | `/admin/requests/:id` | requests: read | Detail with notes |
| PATCH | `/admin/requests/:id` | requests: write | Change status, assign, add note (audited) |
| POST | `/admin/requests/:id/convert` | requests: write and clients: write | Create client and location from the request |

### 28.7 Admin screens
```
┌───────────────────────────────────────────────────────────┐
│ Requests                    [New 5] [Contacted 3] [All]   │
├───────────────────────────────────────────────────────────┤
│ New   Grace M. · 0772…  · Home nursing · Ntinda  · 2h ago │
│ New   Peter K. · 0701…  · Elderly care · Mukono  · 5h ago │
│ Contacted  Sarah N. · …  · assigned: Admin A              │
├───────────────────────────────────────────────────────────┤
│ Detail: contact info · message · status · notes timeline  │
│ [Mark contacted] [Assign] [Add note] [Convert to client]  │
└───────────────────────────────────────────────────────────┘
```
- Dashboard card: **New requests** (count and oldest waiting time), visible to the CEO and admins.
- Notification: dashboard badge, with optional SMS to admins (setting `requests.notify_sms`, default off).
- Filters: status, assigned to, date range, service type. CSV export (reports).

### 28.8 Permissions (add to Section 5)
| Resource | nurse | supervisor | admin | executive | super_admin |
|---|---|---|---|---|---|
| requests | none | none | write (all) | read (all) | write (all) |
`[FILL IN: confirm whether supervisors should see requests for their area]`

### 28.9 Settings (add to Section 25)
`requests.enabled` (default false), `requests.service_types` (list), `requests.notify_sms` (false), `requests.notify_recipients`, `requests.retention_months` (unset), `requests.privacy_notice_version`, `requests.target_response_hours` (unset, display only).

### 28.10 Phase
**Phase 14: Module E** (after the audit, can run in parallel with Phase 3 because it only needs auth, clients and the admin shell).
**Done when:** a form submission appears in the inbox within seconds, spam attempts are throttled, a request converts into a client and location with no retyping, every status change is audited, the CEO sees the new-requests card, and the public site's SEO and speed scores are unchanged.
