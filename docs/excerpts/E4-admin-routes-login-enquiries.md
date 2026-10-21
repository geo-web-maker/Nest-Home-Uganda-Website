# Spec excerpt: admin routes, login, enquiries list (spec 7.1, 7.2, 7.4)
## 7. Admin panel

Route prefix `/admin`. All admin routes except `/admin/login` require a valid session. The admin is part of the same React app but code-split (`React.lazy`) so public visitors never download it.

### 7.1 Screens and routes

| Route | Screen | Roles |
| --- | --- | --- |
| `/admin/login` | Login | all |
| `/admin` | Dashboard | owner, manager, coordinator |
| `/admin/enquiries` | Enquiries list | owner, manager, coordinator |
| `/admin/enquiries/:id` | Enquiry detail | owner, manager, coordinator |
| `/admin/careers` | Jobs list | owner, manager |
| `/admin/careers/new`, `/admin/careers/:id` | Job editor | owner, manager |
| `/admin/applications` | Applications list | owner, manager |
| `/admin/applications/:id` | Applicant detail | owner, manager |
| `/admin/content` | Content manager (tabs) | owner, manager, editor |
| `/admin/settings` | Site settings (tabs) | owner, manager |
| `/admin/users` | Users and roles | owner |
| `/admin/reports` | Reports and exports | owner, manager |
| `/admin/activity` | Activity log | owner, manager |

Navigation order: Dashboard, Enquiries, Careers, Applications, Content, Site settings, Users and roles, Reports, Activity log. Phone bottom nav: Home, Enquiries, Careers, Content, More.

### 7.2 Login

Email and password; "Forgot password?" sends a reset link (valid 30 minutes, single use). Owners and managers are prompted for TOTP when enabled. After 5 failed attempts in 15 minutes the account is locked for 15 minutes. Session: access token 15 minutes; refresh 7 days, rotated on use and revoked on logout and password change.
### 7.4 Enquiries

- List: search (name, phone, area), status tabs (All, New, Contacted, Assessment booked, Care started, Not proceeding), filters for service, area, assigned user and date range, sort by date. Columns: Name, Phone, Service, Area, Status, Received, Assigned. Pagination 25 per page. "Export CSV" button.
- Detail: header with name and "Enquiry · received {time} via {source}"; "Request" box with phone, area, care needed, who needs care, preferred start, source and the family’s note; **Call** (primary, `tel:`) and **WhatsApp** (whatsapp variant, `wa.me/{digits}`) buttons; "Add a note" box; "Status" box (status, assigned to, reason if not proceeding, Update); "Timeline" box (received, alert sent, status changes, notes, with user and time).
- Statuses: New · Contacted · Assessment booked · Care started · Not proceeding (reason: Price, No capacity, Outside area, Other) · Spam (hidden from lists and reports unless filtered).
- Rule: moving a status from New for the first time records `first_contacted_at` (for the average first-reply figure).

