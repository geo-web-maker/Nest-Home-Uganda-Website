# Nest Home Care Uganda: Work Split Guide (ChatGPT chat + Claude + CI)

**Purpose:** the ChatGPT chat has no network, no Docker and no browser, so it can only write code. It cannot run or verify anything. This guide says exactly which work goes where, in what order, and how every piece of ChatGPT output is checked before it counts.

**Companion files:** `BUILDER_INSTRUCTIONS.md` (rules, pins, scope model, SMS) and `nest-home-care-design-package/docs/NEST_HOME_CARE_BUILD_SPEC.md` (the spec). Their rules still apply. This guide replaces only the "run your own checks" parts: ChatGPT never claims a check passed.

---

## 1. Who does what

| Actor | Can | Cannot | Used for |
| --- | --- | --- | --- |
| **Claude** (this chat, with a sandbox) | install packages, run build, lint, typecheck, unit tests; fix failures; review code | keep a repo between sessions on its own; run Docker or a browser unless confirmed in that session; call MongoDB | scaffold, risky core, verification, fixes, final review |
| **ChatGPT chat** | write source files from a precise ticket | run anything; see the repo; install anything | repetitive, spec-driven code against patterns Claude has already built |
| **GitHub Actions (CI)** | real MongoDB, MinIO, Playwright browsers, full test run | write code | the checks neither chat can do |
| **You** | move files between them; paste CI logs | | the glue |

**Golden rule:** code from ChatGPT is **UNVERIFIED** until Claude has run the gate (Section 6) on it. Nothing is built on top of unverified code.

---

## 2. Where the project lives (the repo travels with `.git` inside it)

- The project is one folder, `nest-home-care/`, **with its `.git` folder inside**. That folder is the source of truth. Claude's sandbox resets between sessions, so the folder is what carries history, branches and the state ledger from one session to the next.
- **Handing it to Claude (start of every session).** From the folder that contains `nest-home-care/`, run:
  ```
  zip -r nest-home-care.zip nest-home-care -x "*/node_modules/*" "*/.venv/*" "*/dist/*" "*/__pycache__/*" "*/.env"
  ```
  This keeps `.git` and leaves out dependencies, build output and secrets. Upload `nest-home-care.zip`. Never delete `.git` from the zip. If the zip is too large, tell Claude the size and which folder is big; do not strip `.git`.
- **Getting work back from Claude (end of every session).** Claude returns **patch files made with `git format-patch`** (one file per commit, with the commit message) plus the updated `docs/STATE.md`. You apply them in your copy with `git am path/to/*.patch`. If `git am` fails, run `git am --abort` and send Claude the error text. Claude does not return a full zip of the repo unless asked, because a zip hides what changed.
- **Branches.** `main` is always green. Each batch lives on `batch-NN`. Claude commits on the branch named in the session request, never on `main` unless told to.
- **ChatGPT never sees the repo or `.git`.** It gets a context pack per job (Section 5), pasted as text.
- **Secrets.** `.env` is never committed or zipped. Only `.env.example` is.

### 2.1 Orientation: what Claude does at the start of every session (in this order)

1. Unzip `nest-home-care.zip` into the working directory and `cd` into `nest-home-care/`.
2. Run `bash scripts/orient.sh`. It prints, without changing anything: repo health (`git fsck`), branch, uncommitted changes, stashes, the last 15 commits, `docs/STATE.md`, the tail of `docs/BUILD_LOG.md`, the folder layout and file counts, safety checks (no `.env` tracked, no dependencies tracked, no secrets), and what this session's sandbox has (Node, Python, Docker, npm registry).
3. Read `docs/STATE.md` fully. Its **Next action** line is the task unless the user's message says otherwise. If the user's request conflicts with the ledger (for example asks to verify a job the ledger shows as TODO), say so in one sentence before doing anything.
4. Compare the ledger with git: every step or job marked DONE or ACCEPTED must have a commit hash that exists (`git cat-file -t <hash>`). Report any mismatch and fix the ledger before new work.
5. If `orient.sh` printed any FAIL line, report it and stop. Do not proceed on a damaged repo, a tracked `.env` or a possible secret.
6. Install dependencies from the lockfiles only (`npm ci`, `pip install -r` from the pinned file). Never `npm install` without a lockfile, never update a pin.
7. Run the baseline gate (lint, typecheck, test, build) **before** touching anything, and record the result. This separates problems you inherited from problems you cause. Anything that needs MongoDB, MinIO or a browser and cannot run in this session is recorded as NOT RUN, not skipped silently.
8. State the plan in at most five lines: which step or job, which files, which checks. Then work.

### 2.2 Closing: what Claude does at the end of every session

1. Run the gate again on everything changed; paste real output into `docs/BUILD_LOG.md` (checkpoint format in BUILDER_INSTRUCTIONS Section 8).
2. Update `docs/STATE.md`: statuses, commit hashes, **Next action** (one sentence), CI status, anything newly unverified, any decision or deviation (append only).
3. Commit with messages in the form `<step or job id>: <what>`; one commit per job.
4. Produce `git format-patch <base>..HEAD -o patches/` where `<base>` is the commit the session started from (shown by `orient.sh`). Return the patch files and say the exact command to apply them.
5. End the reply with: what was verified, what was NOT RUN, and the exact next action.

### 2.3 Orientation for you (human) before each session
1. In your copy, run `git status`. It must be clean, and your HEAD must equal the last commit named in `docs/STATE.md`. If not, say so to Claude before uploading.
2. Zip as in Section 2. Upload it with one sentence: the job or step (for example `VERIFY batch-02` or `DO S2`).
3. After the session, `git am` the patches, push to GitHub, wait for CI, and bring the last 80 lines of any failing step back.

## 3. Order of work (do not reorder)

| Step | Owner | What | Output |
| --- | --- | --- | --- |
| S0 | Claude | Preflight, repo scaffold, all pinned dependencies, lockfiles, lint and format config, CI workflow (with MongoDB, MinIO, Playwright), `docker-compose.dev.yml`, README; copy `templates/orient.sh` to `scripts/orient.sh` and `templates/STATE.md` to `docs/STATE.md` and fill in the first ledger | repo that builds green with no features, orientation and ledger in place |
| S1 | Claude | Design foundation: `tokens.css`, `global.css`, `shapes.module.css`, fonts, `Logo`, `Weave`, `Button`, `Rule`, `AccentText`, `Chip`, `Field`, `Badge`, `Accordion`; pre-render spike with `vite-react-ssg` | green build, raw-HTML proof for `/` and `/services` |
| S2 | Claude | **Pattern slice** for the backend: core (config, db, security, errors, rate limit, storage), auth with the **scope model**, audit log, plus ONE complete content module (`services`) with router, schemas, model, service, tests, seed | the template ChatGPT copies |
| S3 | Claude | **Pattern slice** for the frontend: apiClient, generated types, i18n wiring, `seo.tsx`, layouts (`PublicLayout`, `AdminLayout`), route guard by scope, ONE complete public page (Services overview) and ONE complete admin list screen (Enquiries list) | the template ChatGPT copies |
| S4 | Claude | Enquiry flow end to end (BookingForm, `enquiries` module, WhatsApp link, honeypot, rate limit, consent) and notifications (`SmsProvider`, `MamboSmsProvider`, scheduler, retention jobs) | tested vertical slice |
| S5 | ChatGPT, then Claude verifies | Jobs G1 to G12 in Section 4, in the listed order | verified code in batches |
| S6 | Claude + CI | Playwright flows, pre-render of every route, SEO output, deployment files, final review | release candidate |

ChatGPT starts only after S2 and S3 exist, because a pattern to copy removes most of the guessing.

---

## 4. Job list for ChatGPT (S5)

Each job is one chat request. Sizes are hard limits: **at most 6 files and about 500 lines of output per job.** Split a job if it would exceed that. Run jobs in order within a group; groups can be done in any order.

### Group A: presentational frontend (copy the pattern from S1 and S3)
| Id | Files to write | Spec sections | Context pack (paste these) |
| --- | --- | --- | --- |
| G1 | `Rings`, `Steps` (+ CSS Modules, + tests) (`ServiceCard` was built in S3.9, use it as the finished component) | 4.10, 4.11 | spec 2 and 4.10 to 4.11, `tokens.css`, `Button` and `Rule` source |
| G2 | `TeamCard`, `PriceCard`, `JobCard`, `InfoCard`, `MapPlaceholder` | 4.12, 4.15 | spec 4.12, 4.15, `tokens.css`, one finished component from G1 |
| G3 | `Strip`, `CheckList` (`PageHero` and `CtaBand` were built in S3.8) | 4.8, 4.14 | spec those sections, `tokens.css`, one finished component |
| G4 | Home page sections composition (`features/public/home`) | 5.1, 4.7 | spec 5.1, S3's finished Services page as pattern |

### Group B: public pages (copy the S3 page pattern)
| Id | Files | Spec | Context pack |
| --- | --- | --- | --- |
| G5 | About, Team | 5.4, 5.5 | spec 5.4, 5.5, pattern page |
| G6 | How it works and pricing, Areas | 5.6, 5.7, 5.8 | spec 5.6 to 5.8, pattern page |
| G7 | FAQ, Privacy | 5.9, 5.12 | spec 5.9, 5.12, pattern page (placeholders for legal text exactly as spec 12 says) |
| G8 | Service detail page (`/services/:slug`) | 5.3 | spec 5.3, pattern page, the `services` API types |
| G9 | Careers list, Job detail | 5.10 | spec 5.10, pattern page |

### Group C: backend content modules (copy the S2 `services` module)
| Id | Files | Spec | Context pack |
| --- | --- | --- | --- |
| G10 | `team`, `faqs` modules (model, schemas, router, service, tests) | 8.3, 9.2, 9.3, 9.5 | the complete `services` module, spec 8.3 rows for these collections, `scopes.py` |
| G11 | `testimonials`, `areas`, `pricing` modules | same | same |
| G12 | `articles`, `pages`, `media` modules | same, 9.6 | same, plus the `StorageService` interface |

### Group D: admin screens (copy the S3 Enquiries list pattern; API contract is the generated types)
| Id | Files | Spec | Context pack |
| --- | --- | --- | --- |
| G13 | Dashboard, Activity log | 7.3, 7.10 | spec 7.3, 7.10, pattern screen, generated types |
| G14 | Enquiry detail (status, notes, assign, call and WhatsApp buttons) | 7.4 | spec 7.4, pattern screen, types |
| G15 | Jobs list, Job editor | 7.5 | spec 7.5, pattern screen, types |
| G16 | Applications list, Applicant detail | 7.5 | same |
| G17 | Content manager tabs (one tab per request, six requests) | 7.6 | spec 7.6, pattern screen, types |
| G18 | Site settings tabs (one tab per request, seven requests; the SMS tab needs `system:manage`) | 7.8 and BUILDER_INSTRUCTIONS 13.3 | spec 7.8, instructions 13.3, pattern screen |
| G19 | Users and scopes screen | BUILDER_INSTRUCTIONS 12.5 | instructions 12.2 to 12.5, pattern screen, types |
| G20 | Reports screen | 7.9 | spec 7.9, pattern screen |

### Group E: content and strings
| Id | Files | Context pack |
| --- | --- | --- |
| G21 | `locales/en/*.json` extracted from finished components (give it the component files) | the components, instructions rule: no hard-coded strings |
| G22 | Seed files: 8 services, areas, FAQ, three pricing blocks, sample jobs (spec 12.1 to 12.4 exact placeholder strings only) | spec 12 |

### Never give to ChatGPT (Claude only)
Auth and refresh-token logic, scope enforcement, argon2 and JWT code, the scope registry, rate limiting, honeypot and consent handling, file upload validation and private storage links, `SmsProvider` and `MamboSmsProvider`, the scheduler and retention jobs, migrations, Dockerfile, CI, deploy files, the pre-render config, and every test that proves a security rule (12.6).

---

## 5. How to ask ChatGPT (copy these exactly)

### 5.1 Standing instruction (paste once at the start of every ChatGPT chat)
```
You are a code writer for the Nest Home Care Uganda project. You cannot run code, install packages or see the repository. Rules:
1. Write only the files named in the ticket. Do not create extra files.
2. Copy the structure, naming and style of the PATTERN files in the context pack. If something is missing from the context pack, STOP and list what is missing. Do not guess.
3. Use only the pinned library versions and APIs in the context pack. No new libraries.
4. Follow the spec text pasted in the ticket exactly. Do not invent copy, prices, medical claims, field names or endpoints.
5. No roles anywhere. Access is by scopes only.
6. No hard-coded user-facing strings in components; use the i18n keys convention shown in the pattern files.
7. Never write that code "works" or "passes". You have not run it. Mark everything UNVERIFIED.
8. Output format is fixed (Section "Return format" in the ticket). No other commentary.
```

### 5.2 Job ticket template
```
JOB: <id, for example G5>
GOAL: <one sentence>
FILES TO WRITE (exact paths):
  - <path 1>
  - <path 2>
SPEC TEXT (verbatim, authoritative):
  <paste the listed spec sections>
PATTERN FILES (copy their structure and style):
  <paste the finished pattern files, each under its path>
CONTEXT FILES (read only, do not edit):
  <tokens.css, scopes.py, generated types, whatever the job list names>
ACCEPTANCE (what Claude will check):
  - <3 to 6 concrete, checkable points taken from the spec>
RETURN FORMAT:
  For each file: a line "### path/to/file" then ONE fenced code block with the complete file.
  After the files: a section "ASSUMPTIONS" (bullets, empty if none) and a section "MISSING INFO" (bullets, empty if none).
  Nothing else. End with the single word UNVERIFIED.
```

### 5.3 Rework ticket (after Claude finds problems)
```
JOB: <id>-R<n>
The previous output had these problems. Fix only these. Return only the changed files in full, same return format.
PROBLEMS:
  1. <file>:<line> <what is wrong> <what the spec says>
  2. ...
```

---

## 6. How Claude verifies (the gate)

You upload `nest-home-care.zip` (with `.git`, Section 2) plus the returned ChatGPT files in a separate `returned/` folder, and say: `VERIFY job <id>`. Claude first runs the orientation (Section 2.1), then:

1. Applies the files to a branch and checks that only the ticket's paths changed. **Any extra file is deleted and noted.**
2. Reads every file against the ticket's spec text and acceptance points. Flags invented content, wrong names, hard-coded strings, roles, missing scopes, deep cross-module imports.
3. Runs, in this order: install (from lockfile), `lint`, `typecheck`, `test`, `build` for the frontend; `ruff check`, `pytest -q` for the backend (backend tests that need MongoDB run in CI, see Section 7).
4. Fixes small problems itself (naming, imports, lint, types) and lists each as a one-line change.
5. For larger problems, writes a **rework ticket** (Section 5.3) for ChatGPT instead of rewriting.
6. Returns: a **patch file**, a verification report (what ran, real output, PASS or FAIL per check, NOT RUN where it could not run), and the merge decision: `ACCEPT`, `ACCEPT WITH FIXES`, or `REWORK`.

A job counts as done only on `ACCEPT` or `ACCEPT WITH FIXES` **and** a green CI run (Section 7).

**Limits to expect:** Claude cannot see rendered pages unless a browser is available in that session; visual checks come from CI screenshots (Section 7). Claude does not claim visual fidelity without them.

---

## 7. CI (written by Claude in S0; you only run and paste)

The workflow runs on every push and pull request:

1. Services: `mongo:7` started as a single-node replica set, MinIO.
2. Frontend: `npm ci`, lint, typecheck, unit tests, build (including pre-render).
3. Backend: `ruff check`, `pytest -q` against the real MongoDB and MinIO.
4. Playwright: install browsers, run the critical flows, **save screenshots at 390, 820, 1024, 1280 and 1920 px as artifacts**.
5. Raw-HTML check: after build, grep every public route's HTML for title, description, canonical and JSON-LD.

When CI fails, you paste into Claude: `CI FAILED job <id>` plus the **last 80 lines of the failing step's log** (not the whole log). When you want a visual check, download the screenshots artifact and upload the images.

---

## 8. Cadence and batching

- Do ChatGPT jobs in **batches of 3 to 5**, then one Claude verification session for the batch. Cheaper than verifying each, and conflicts surface together.
- Never start a new batch until the previous batch is `ACCEPT` and CI is green.
- Keep one branch per batch (`batch-01`, `batch-02`), merged to `main` only when green.
- After every batch, Claude updates `docs/BUILD_LOG.md` with the verification report. This is the review record.

---

## 9. Failure handling

| Situation | Action |
| --- | --- |
| ChatGPT says "missing info" | Add the named file or spec text to the context pack and resend. Do not let it guess. |
| Output exceeds the size limit or is cut off | Split the job into smaller jobs and resend. |
| Same job fails verification twice | Claude takes the job over and writes it. Stop sending it to ChatGPT. |
| ChatGPT drifts (extra files, new libraries, invented copy, roles) | Open a fresh chat, paste the standing instruction again, resend the ticket. Long chats drift. |
| Pattern files turn out to be wrong | Fix the pattern first (Claude), then redo every job that copied it. |
| Spec and reference HTML disagree | Reference wins on measured values. Claude decides and records it in `BUILD_LOG.md`. ChatGPT is never asked to decide. |

---

## 10. Definition of done for the whole project

1. Every job `ACCEPT`, CI green on `main`.
2. Every scope-protected endpoint passes the parametrised test in BUILDER_INSTRUCTIONS 12.6.
3. Every public route's pre-rendered HTML has its own title, description, canonical and JSON-LD.
4. Screenshots at five widths reviewed for Home, Services, one service page, Contact, and the admin Enquiries and Settings screens.
5. No hard-coded user-facing strings outside `locales/` or the database (grep proof).
6. No `role` field, enum or UI label anywhere (grep proof).
7. `.env.example` complete; no secrets in the repo (grep proof).
8. Claude's final review recorded in `docs/BUILD_LOG.md`.
