# Rules excerpt: route to scope table and navigation (BUILDER_INSTRUCTIONS 12.3)
### 12.3 Route to scope map (replaces the "Roles" column in spec 7.1)

A route is visible and reachable only if the user has **all** scopes listed.

| Route | Needs |
| --- | --- |
| `/admin` | `dashboard:view` |
| `/admin/enquiries`, `/admin/enquiries/:id` | `enquiries:read` (actions need `enquiries:write`) |
| `/admin/careers`, `/admin/careers/new`, `/admin/careers/:id` | `jobs:read` (editing needs `jobs:write`) |
| `/admin/applications`, `/admin/applications/:id` | `applications:read` (actions need `applications:write`) |
| `/admin/content` | `content:read` (editing `content:write`, publishing `content:publish`, uploads `media:write`) |
| `/admin/settings` | `settings:read` (saving `settings:write`; the SMS tab needs `system:manage`) |
| `/admin/users` | `users:read` (changes need `users:write`) |
| `/admin/reports` | `reports:read` (export buttons need `reports:export`) |
| `/admin/activity` | `activity:read` |

Navigation shows only reachable items. A user who can reach none sees a plain page: "No access has been granted to this account", with the business phone number. The phone bottom nav shows the first four reachable items plus "More".

