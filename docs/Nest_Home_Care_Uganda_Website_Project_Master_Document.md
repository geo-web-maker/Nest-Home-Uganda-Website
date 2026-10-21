# Nest Home Care Uganda: Website Project Master Document

**Version 1.0 · Prepared for the Nest Home Care team and the web designer**

This document records everything decided so far, sets out the structure of the full website, and specifies the admin panel, enquiry form and careers system. It is the single reference for design, build and handover.

---

## 1. Project summary

| Item | Detail |
| --- | --- |
| Client | Nest Home Care Uganda |
| Business | Home-based nursing and care in Kampala |
| Contact | 0787 499 988 (tel link +256787499988) |
| Office | Kampala, Uganda |
| Goal | Win trust from families and turn visits into calls, WhatsApp messages and bookings |
| Primary visitors | Adult children arranging care for parents, new mothers, post-surgery patients, hospital discharge teams |
| Main devices | Phones first (most Ugandan web traffic), then desktop and tablet |
| Brand look | Forest green and gold, egg and arch shapes, a woven "nest" edge |

**What the client already has:** two printed flyers (services, team photos, contact line) showing the green scrubs, nest logo and the core service list.

---

## 2. Decisions log

| # | Decision | Outcome |
| --- | --- | --- |
| 1 | How to show the client website samples | Design screens delivered as a shareable link plus HTML and PDF files |
| 2 | Research on industry sites | Studied strong home care sites (Right at Home, BrightStar Care, Home Instead, Interim Healthcare, FirstLight, Radfield). Lessons: call and booking button always visible, plain language, real faces, services shown with icons, honest pricing information |
| 3 | Concept designs | Three directions built: **Nest** (green and gold), **Fresh** (white, mint and arches), **Golden** (dark with gold lines) |
| 4 | Client choice | The client chose **Nest** |
| 5 | Final design | Nest base with hints of Fresh (mint sections, arches, white cards, leaf green) and Golden (thin gold lines, diamond markers, gold italic accent words, gold-ringed circles) |
| 6 | Site size | A single page is not enough; a multi-page site is required (Section 5) |
| 7 | Device layouts | Phone, tablet and desktop each get their own layout rules (Section 6) |
| 8 | Admin, forms and careers | Admin panel required; form and careers approach set in Sections 7 to 9 |

---

## 3. Brand and design summary

The full measured specification lives in the separate file `nest-home-care-design-system.md`. The essentials:

**Colours**

| Role | Hex |
| --- | --- |
| Forest (header, hero, dark bands) | `#123524` |
| Gold (buttons, accents, lines) | `#C79A3B` |
| Leaf green (service icons) | `#1F8A5B` |
| Moss (selected chips, shapes) | `#2F6B4A` |
| Mint (alternate sections) | `#DFF0E6` |
| Page background | `#F3F8F1` |
| Text on light | `#123524` |
| Secondary text | `#4A6354` |
| Text on dark | `#F4F1DF` |
| WhatsApp actions | `#25D366` |

**Fonts:** Fraunces (headings), Figtree (body and interface), Cormorant Garamond italic (one gold accent phrase per heading).

**Shapes:** egg (decoration), arch (people and icons), circle (values), pill (buttons), diamond (small markers).

**Tone:** warm, calm, dignified. Short sentences, no clinical jargon, speak to the family.

**Existing deliverables**

| File | Purpose |
| --- | --- |
| `nest-home-care-final.html` | Final single-page design (reference build) |
| `nest-home-care-designs.html` and `.pdf` | The three concept designs, shown on phone, tablet and desktop |
| `nest-home-care-design-system.md` | Full style guide |
| This document | Master plan |

---

## 4. Goals and success measures

1. **More enquiries:** calls, WhatsApp messages and form submissions.
2. **More trust:** visible nurse qualifications, real photos, clear process.
3. **Easier operations:** every enquiry and job application captured in one place instead of scattered chats.
4. **Easier staffing:** a careers page that brings in qualified nurses.

Measure monthly: number of enquiries by source (call, WhatsApp, form), enquiries converted to visits, applications received, top pages visited, and how many visitors came from phones.

---

## 5. Site structure (sitemap)

A care business is a trust decision. Visitors need depth, and Google ranks dedicated pages for each service far better than one long page.

### 5.1 How the structure was decided

1. List what a family needs to know before calling: what you do, who comes to the door, how much, where, how to book.
2. Group related items into pages. Anything someone might search for alone (for example "newborn care Kampala") gets its own page.
3. Check against real phone calls. The client lists the questions families ask most; those become FAQ and page content.
4. Keep the main menu to six items so nobody is lost on a phone.

### 5.2 Sitemap

```
Home
Services
  ├─ Elderly and companion care
  ├─ Postnatal and newborn care
  ├─ Wound care and medication
  ├─ Physiotherapy at home
  ├─ Palliative and respite care
  ├─ Chronic disease management
  ├─ Pediatric home nursing
  └─ Hospital to home transition
About us
  └─ Our team
How it works and pricing
Areas we serve
FAQ and care tips (blog)
Careers
  └─ Job detail and application
Contact and book
Privacy policy and terms
```

### 5.3 Main menu

**Services · About · How it works · Careers · Contact**, plus the gold "Call 0787 499 988" button. Areas, FAQ and policies sit in the footer.

### 5.4 Page specifications

| Page | Purpose | Key content | Main action |
| --- | --- | --- | --- |
| **Home** | First impression and quick routing | Hero, location strip, service highlights, "Our promise" circles, three steps, team preview, testimonials, booking prompt | Book a home visit |
| **Services overview** | Show everything offered | All 8 services as cards with short descriptions | Open a service or book |
| **Service page** (x8) | Convince and rank on Google | Who it is for, what a visit includes, how often, what the family should prepare, related services, FAQ, booking prompt | Book this care |
| **About us** | Build trust | Story, mission, values, registration and licences, how nurses are chosen and trained | Meet the team |
| **Our team** | Put faces on the service | Arch photo frames, name, role, qualification, a short line | Book a visit |
| **How it works and pricing** | Remove uncertainty | The 3 steps, what an assessment includes, pricing approach (fixed price list or "free assessment then quote"), payment methods | Book an assessment |
| **Areas we serve** | Local search | List of Kampala neighbourhoods and surrounding areas, with a map | Check my area |
| **FAQ and care tips** | Answer questions and bring traffic | Common questions, short helpful articles (for example caring for a newborn, preventing bedsores) | Contact us |
| **Careers** | Recruit nurses and carers | Why work here, open roles, how hiring works, application form | Apply now |
| **Contact and book** | Convert | Booking form, phone, WhatsApp, office address, map, opening hours | Send enquiry |
| **Privacy and terms** | Legal trust | Data use, consent, cookie notice | – |

### 5.5 Build order

- **Phase 1:** Home, Services overview and the 3 most requested service pages, About, Contact.
- **Phase 2:** remaining service pages, Team, How it works and pricing, Areas, Careers.
- **Phase 3:** FAQ and articles, testimonials, extras.

---

## 6. Responsive layout specification

Each device has its own constraints, so layouts are redesigned per size, not just scaled. Components and content stay the same; the arrangement changes.

### 6.1 Breakpoints

| Name | Width | Notes |
| --- | --- | --- |
| Phone | under 700px | One column, thumb reach |
| Tablet | 700px to 1039px | Two columns, touch targets stay large |
| Desktop | 1040px and up | Split layouts, hover states, content capped at 1180px |

Test also at 390px (phone), 820px (tablet), 1024px (small laptop), 1280px (desktop) and 1920px (ultrawide).

### 6.2 Section by section

| Section | Phone | Tablet | Desktop |
| --- | --- | --- | --- |
| Header | Logo and call button; menu behind a button | Full menu appears | Full menu, hover colour change, a Services dropdown listing the 8 services |
| Hero | Headline then shapes, stacked | Stacked with larger shapes | Two columns: text left, shapes right |
| Service cards | 1 column | 2 columns | 4 columns, icon above text |
| Values circles | Stacked | 3 across | 3 across, larger spacing |
| Steps | Vertical dotted line | Three columns, horizontal line | Same, wider spacing |
| Team | 2 columns | 4 columns | 4 columns, bio on hover or below photo |
| Booking | Form below text | Form below text | Text and form side by side |
| Call and WhatsApp | Sticky bottom bar | Sticky bottom bar | Buttons in header and sections, bar hidden |
| Service page | Single column; sticky "Book" button | Content and a summary card | Content left, sticky booking card right |
| Admin panel | Cards and bottom navigation | Collapsible sidebar | Fixed sidebar and data tables |

### 6.3 Rules that prevent a broken desktop

1. Cap content width at 1180px and text lines at about 60 to 70 characters.
2. Change the layout, not only the size.
3. Use extra space on purpose: larger headings, more padding, two-column sections.
4. Add desktop helpers (hover effects, sticky side cards, dropdown menu) and remove phone helpers (the sticky bar).
5. Never rely on hover for essential information, because tablets and phones cannot hover.

---

## 7. Enquiry and booking form

### 7.1 The decision: WhatsApp only, or also capture in the admin?

| Option | How it works | Strengths | Weaknesses |
| --- | --- | --- | --- |
| **A. WhatsApp only** | The form builds a message and opens WhatsApp | Free, instant, familiar to Ugandan families | Nothing is stored; no records; staff must copy details; no reports |
| **B. Form saved to admin only** | Form posts to the server; staff reply later | Full records and reports | Slower than WhatsApp; families may prefer chatting; nothing happens if staff miss it |
| **C. Hybrid (recommended)** | The form saves the enquiry to the admin, then opens WhatsApp with the same message ready to send | Staff get a record plus the instant chat; works even if the visitor never presses send | Slightly more build work |

**Recommendation: Option C.** Every enquiry is recorded, which allows follow-up, reporting and proof of response time, while WhatsApp stays as the fast conversation channel. Call and WhatsApp buttons (not the form) stay in the header, sticky bar and footer for people who do not want to fill anything in.

If the client prefers to ignore the saved-form part for now, build Option A first (it already exists in the design) and add the saving later; the form fields below are designed so this upgrade needs no redesign.

### 7.2 Form fields

| Field | Required | Notes |
| --- | --- | --- |
| Your name | Yes |  |
| Phone number | Yes | Validate Uganda formats (07xx and +2567xx) |
| Who needs care | Yes | Choices: Myself, My parent, My spouse, My child or baby, Someone else |
| Care needed | Yes | Multi-select chips for the 8 services |
| Location or area | Yes | Neighbourhood in Kampala or surrounding area |
| Preferred start | No | Today, This week, Later, Not sure |
| Short note | No | Anything the nurse should know (limit 500 characters) |
| Consent | Yes | "I agree that Nest Home Care may contact me about this request" with a link to the privacy page |

Keep medical detail out of the form. Ask for only what is needed to arrange the first call. Sensitive details are collected by the nurse during the assessment.

### 7.3 After sending

1. The visitor sees a thank-you message: "Thank you. A nurse will contact you shortly." with a button to continue on WhatsApp.
2. The enquiry appears in the admin with status **New**.
3. Staff are alerted (Section 8.6).
4. Spam protection: hidden honeypot field, rate limiting and a lightweight bot check.

---

## 8. Admin panel

A private area where Nest Home Care staff manage enquiries, job applications and the website's content without needing a developer.

### 8.1 Users and roles

| Role | Can do |
| --- | --- |
| **Owner** | Everything, including users, settings and exports |
| **Manager** | Manage enquiries, applications, content and reports |
| **Coordinator** | View and update enquiries and applications; add notes |
| **Editor** | Edit website content (services, team, FAQ, articles) only |

Every action is logged with the user, time and what changed.

### 8.2 Modules

| Module | What it does |
| --- | --- |
| **Dashboard** | Today's new enquiries, unanswered count, applications waiting, this month's totals, a simple chart by week |
| **Enquiries** | List, search, filter by status, service, area and date; open an enquiry to see all details, notes and history |
| **Careers** | Create, edit, pause and close job posts; see applications per job |
| **Applications** | Review applicants, open CV, rate, add notes, move through the hiring stages |
| **Content** | Edit services, team members, FAQ, articles, testimonials and areas served |
| **Media library** | Upload and organise team and care photos (auto-resized) |
| **Settings** | Phone and WhatsApp number, office address, opening hours, notification emails, social links |
| **Users** | Add staff, set roles, reset passwords |
| **Reports** | Export enquiries and applications to CSV or Excel |

### 8.3 Enquiry pipeline

| Status | Meaning |
| --- | --- |
| New | Just received |
| Contacted | Staff have called or messaged |
| Assessment booked | Home assessment scheduled |
| Care started | Became a client |
| Not proceeding | Closed, with a reason (price, no capacity, outside area, other) |
| Spam | Hidden from reports |

Each enquiry stores: who, phone, service, area, source (website form, call button, WhatsApp button), assigned staff member, notes and a timeline. Staff can tap a number to call or open a WhatsApp chat directly from the record.

### 8.4 Hiring pipeline

| Stage | Meaning |
| --- | --- |
| Received | Application arrived |
| Shortlisted | Passed first review |
| Interview | Interview scheduled |
| Reference and licence check | Documents verified |
| Offer | Offer sent |
| Hired | Joined the team |
| Declined | Closed, with a reason |

### 8.5 Key screens

- **Login:** email and password, optional two-step verification, "forgot password".
- **Dashboard:** summary cards, newest enquiries list, applications waiting.
- **Enquiries list:** table on desktop (name, phone, service, area, status, assigned, date) and stacked cards on phones.
- **Enquiry detail:** contact details with call and WhatsApp buttons, status control, notes, timeline.
- **Job editor:** title, department, location, type, description, requirements, closing date, publish toggle.
- **Applicant detail:** answers, CV preview, rating, notes, stage control.
- **Content editors:** simple forms with a live preview and an Undo for the last change.

### 8.6 Notifications

- New enquiry: email to the coordinator group, plus an optional SMS or WhatsApp alert to the on-duty phone.
- New application: email to the manager.
- Reminder if an enquiry stays **New** for more than 30 minutes during working hours (time adjustable).
- Optional automatic confirmation to the visitor by SMS: "Thank you for contacting Nest Home Care. A nurse will call you shortly."

### 8.7 Admin on small screens

Staff will often work from a phone. The admin uses bottom navigation (Dashboard, Enquiries, Careers, Content, More), large tap targets and one-tap calling, using the same green and gold identity as the public site.

---

## 9. Careers

### 9.1 Public careers page

- Hero: "Join the team that cares for Uganda's families."
- Why work with us: purpose, training, fair pay, safe working, growth (use only claims the client can honour).
- Open roles list: title, location, type (full-time, part-time, contract), closing date.
- How hiring works: Apply, Review, Interview, Checks, Offer.
- A general "Register your interest" form for when no role is open.

### 9.2 Typical roles

Registered nurse, enrolled nurse, midwife, nursing assistant, physiotherapist, caregiver and companion, coordinator, driver.

### 9.3 Application form

| Field | Required |
| --- | --- |
| Full name | Yes |
| Phone and email | Yes |
| Role applying for | Yes (pre-filled from the job) |
| Professional registration number (for example Uganda Nurses and Midwives Council) | For clinical roles |
| Qualification and years of experience | Yes |
| Area of residence | Yes |
| Availability and expected start | Yes |
| CV upload (PDF or Word, under 5 MB) | Yes |
| Short cover note | No |
| Consent for storing the application | Yes |

Supporting documents (certificates, licences, references) are requested later in the process, not on the first form.

### 9.4 Rules

- Closed roles disappear from the public page automatically on the closing date.
- Uploaded files are scanned and stored privately, never on a public link.
- Applicants are told how long their data is kept (suggest 12 months) and may ask for deletion.

---

## 10. Data model

| Table | Main fields |
| --- | --- |
| **users** | id, name, email, password (hashed), role, active, last login |
| **enquiries** | id, name, phone, relationship, services, area, start, note, source, status, assigned user, consent, created, updated |
| **enquiry\_notes** | id, enquiry, user, text, created |
| **jobs** | id, title, department, location, type, description, requirements, closing date, published |
| **applications** | id, job, name, phone, email, registration number, qualification, experience, area, availability, CV file, cover note, stage, rating, consent, created |
| **application\_notes** | id, application, user, text, created |
| **services** | id, name, slug, summary, body, icon, order, published |
| **team** | id, name, role, qualification, bio, photo, order, published |
| **faqs** | id, question, answer, service (optional), order |
| **articles** | id, title, slug, body, image, published date |
| **testimonials** | id, name (first name and area), text, approved |
| **areas** | id, name, order |
| **settings** | key, value (phone, WhatsApp, address, hours) |
| **audit\_log** | id, user, action, item, time |

---

## 11. Technical approach

### 11.1 Options

| Option | Best for | Trade-offs |
| --- | --- | --- |
| **WordPress with a custom theme and form plugin** | Fast delivery, familiar editor | Needs updates and security care; admin look is generic |
| **Headless CMS (Sanity, Strapi, Directus) plus a static front end** | Fast, editable content | Enquiries and hiring still need a small custom admin |
| **Custom build (Next.js front end with a database and a custom admin)** | Exactly the admin described above, full brand control | Most build effort; needs ongoing maintenance |

**Recommendation:** a custom build or a headless CMS plus a small custom admin for enquiries and hiring. This gives the exact pipeline and mobile-friendly admin described here, while content pages stay fast.

### 11.2 Important constraint

The design previews built so far are static pages. They cannot store form data or run an admin panel on their own. The admin, database and email or SMS sending require a real hosted backend.

### 11.3 Uganda-specific considerations

- Performance first: compressed images, minimal scripts and fonts, tested on slow mobile data.
- SMS and alerts through a regional provider such as Africa's Talking (confirm current pricing and availability).
- WhatsApp links work now; the WhatsApp Business API can be added later for automatic replies.
- Mobile-money payment options can be listed on the pricing page (information only at first).
- Local hosting or a nearby cloud region reduces delay; confirm client preference.

---

## 12. Security and privacy

- HTTPS everywhere, hashed passwords, role-based access, optional two-step login for the Owner and Managers.
- Collect the minimum personal data; no detailed medical history in forms.
- Clear consent text on every form, with a privacy policy page.
- Private file storage for CVs, with time-limited access links.
- Encrypted backups, tested restore, and an audit log of admin actions.
- Uganda's Data Protection and Privacy Act, 2019 applies to personal data handling, and health information is sensitive. Have a qualified Ugandan lawyer review the privacy policy, retention periods and any registration duties before launch. This document is not legal advice.

---

## 13. SEO and analytics

- One page per service, each with a unique title and description (for example "Newborn and Postnatal Care at Home in Kampala | Nest Home Care").
- Local business structured data with the office address, phone and opening hours; a Google Business Profile that matches the website exactly.
- Clear headings, descriptive image names and alt text, fast loading.
- Care-tip articles that answer real family questions.
- Analytics that respects privacy, tracking calls, WhatsApp clicks, form sends and applications as goals.

---

## 14. Content the client must supply

- Real nurse photos, names, roles, qualifications and registration details.
- Business registration, licences and any professional body memberships.
- Detail for each service: who it is for, what a visit includes, how often.
- Pricing approach, or the wording for a free assessment.
- Full list of areas served and opening hours.
- Three to five testimonials, with written permission.
- Common family questions (from phone calls) for the FAQ.
- Open job roles and the hiring process.
- Confirmation that WhatsApp is on 0787 499 988, and who monitors alerts.
- Social media links, if any.

Photo guidance: portrait crops at 3:4, plain or natural background, green scrubs, under 200 KB each after optimisation.

---

## 15. Roadmap

| Phase | Scope | Result |
| --- | --- | --- |
| **0. Foundations** | Sitemap, content collection, final design system | Approved plan (this document) |
| **1. Core site** | Home, Services overview, three service pages, About, Contact with Option A form | Live website to start generating enquiries |
| **2. Admin and enquiries** | Backend, login, enquiries module, form upgraded to Option C, notifications | Every enquiry recorded and tracked |
| **3. Full content** | Remaining services, Team, How it works and pricing, Areas, FAQ | Complete site |
| **4. Careers** | Careers page, application form, hiring module | Recruiting inside the admin |
| **5. Growth** | Articles, testimonials, Google Business Profile, analytics review | Steady search traffic |

---

## 16. Open questions for the client

1. Should enquiries be saved in the admin (recommended), or WhatsApp only for now?
2. Who receives alerts, and during which hours?
3. Does the client want prices shown, or a free assessment and quote?
4. Which roles will they recruit in the first three months?
5. Do they already have a domain name and email addresses?
6. Do they want the site in English only, or also Luganda?
7. Who will maintain content day to day?

---

## 17. Next steps

1. Client answers the open questions in Section 16.
2. Collect the content and photos listed in Section 14.
3. Build the Services page and a service detail page in all three responsive layouts.
4. Design the admin screens (dashboard, enquiries, careers) as clickable previews for approval.
5. Confirm the technical approach, hosting and budget.
