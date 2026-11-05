# Mail rich-content dependency pins

written, not validated

The shared rich composer uses TipTap **3.31.4** in both the admin and nurse apps. This release was published on 30 September 2026, more than 14 days before the 5 November 2026 implementation date. The project deliberately avoids the newly published 3.32.x line for this handover. Keep every TipTap package on the same exact version; do not use ranges.

| Package | Exact pin |
|---|---:|
| `@tiptap/core` | `3.31.4` |
| `@tiptap/react` | `3.31.4` |
| `@tiptap/pm` | `3.31.4` |
| `@tiptap/starter-kit` | `3.31.4` |
| `@tiptap/extension-underline` | `3.31.4` |
| `@tiptap/extension-link` | `3.31.4` |
| `@tiptap/extension-text-align` | `3.31.4` |
| `@tiptap/extension-text-style` | `3.31.4` |
| `@tiptap/extension-color` | `3.31.4` |
| `@tiptap/extension-highlight` | `3.31.4` |
| `@tiptap/extension-table` | `3.31.4` |
| `@tiptap/extension-table-row` | `3.31.4` |
| `@tiptap/extension-table-header` | `3.31.4` |
| `@tiptap/extension-table-cell` | `3.31.4` |
| `@tiptap/extension-image` | `3.31.4` |
| `@tiptap/extension-placeholder` | `3.31.4` |

Both app manifests use these exact pins. Lockfile-only regeneration was attempted here but npm did not finish resolving the registry within the available execution window, so the committed package-lock files still need to be refreshed. In each app directory, run `npm install --ignore-scripts` once to reconcile the lockfile, review the diff, and commit it before using `npm ci`. This handover does not claim a bundle-size measurement. The editor is lazy-loaded in both apps. The nurse app budget was 200 KB gzip total and 80 KB per route chunk. The measured build was 320 KB total with a 151 KB editor chunk, and the owner chose to raise the budget to 360 KB total / 160 KB per route chunk (`scripts/check-bundle-size.mjs`, 2026-11-05). Do not raise it further without the owner's say-so.

`aiosmtplib` is pinned to `5.1.3` in the backend project and requirements lock. Python dependencies and JavaScript package installs have not been run as validation here.

`nh3` and `css-inline` remain intentionally absent. The server sanitizer uses the standard library until those third-party APIs and exact wheel pins are verified against `backend/app/modules/mail/html_policy.py`.
