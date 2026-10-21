# Rules excerpt (BUILDER_INSTRUCTIONS): hard rules and scope model
1. **Source of truth order:** (a) this file, (b) the build spec, (c) `reference/nest-home-care-complete.html` for look and behaviour (it wins over the spec on any measured value), (d) the other docs. Never use memory or "common practice" to settle a conflict. Stop and ask.
2. **Do not reopen decisions.** Spec Section 0.3 lists 14 decisions. They are final.
3. **Do not invent content.** Copy, prices, licences, nurse names, testimonials, legal text and the seven non-postnatal service bodies are "client to supply". Use the exact placeholder strings in the spec (Section 12). Never write medical claims.
4. **Do not add features, libraries, pages, fields or settings** not in the spec. No Tailwind, no UI kit, no Redux, no Next.js, no Motor, no SQL.
5. **Use only the pinned versions in Section 4.** Do not run `npm update`, `npm install <pkg>@latest`, or `pip install <pkg>` without a version. Do not change a pin without asking.
6. **Production CSS uses media queries** at `min-width: 700px` and `min-width: 1040px`. Never copy `@container` rules or `cqi` units from the reference (use `vw` where the reference uses `cqi`).
7. **Never claim something works unless you ran it.** Every claim in your report needs the command and its real output (Section 8). If you did not run it, write "NOT RUN".
8. **Never store secrets in the repo.** Only `.env.example` with empty or dummy values.
9. **Never edit** files under `docs/`, `reference/` or `design/` (read-only inputs).
10. **No silent fallbacks.** If a step fails, do not work around it with a different approach. Report the exact error and stop.
11. **Edits to existing files are small diffs, not full rewrites.** Rewrite a file in full only if you created it in the current phase.
12. **Text style in code, comments and UI strings:** plain English, short sentences. No emojis. Use a normal hyphen or a comma, never an em dash.

## 3. Corrections to the spec (these override it)

| # | Spec says | Do this instead | Reason |
| --- | --- | --- | --- |
| C1 | Backend: "Beanie (async ODM on Motor)" | Beanie **2.2.0** with **PyMongo async** (`from pymongo import AsyncMongoClient`). **Do not install `motor`.** | Beanie 2.x depends on PyMongo, not Motor (verified from its package metadata). |
| C2 | "React Router 6" | `react-router-dom` **6.30.6** only. Never 7. | `vite-react-ssg@0.9.2` peers on `react-router-dom ^6.14.1`. |
| C3 | "TypeScript (strict)" | TypeScript **5.9.3** only. Never 6 or 7. | Newest major is a rewrite; tooling not guaranteed. |
| C4 | Pre-render tool "left open" | Use **`vite-react-ssg` 0.9.2** for public routes. Admin routes are NOT pre-rendered (client-only). | Decision made for you so the build is deterministic. |
| C5 | Reference uses container queries | Use media queries (Rule 6). | Spec 0.2. |
| C6 | Admin users have roles (owner, manager, coordinator, editor), role tables in spec 7.7, 7.1, 9.5, enum `user_role`, `require_roles(...)` | **No roles anywhere.** Users carry a list of **scopes** plus an `is_superadmin` flag. Build exactly what Section 12 says. Wherever the spec says "role", a "Roles" column, or Owner, Manager, Coordinator, Editor as a permission concept, apply Section 12 instead. | Owner decision: access is scope-based so each client is set up by granting scopes. |
| C7 | SMS provider "MambaSMS"; visitor SMS off by default; SMS keys in the Notifications tab | Provider is **MamboSMS**. SMS goes to **both staff and visitors**, both switches default **on**, and all SMS settings are editable only with scope `system:manage` (superadmin). Build exactly what Section 13 says. | Owner decision. |

If you find another conflict, do not decide. Use Section 7.

