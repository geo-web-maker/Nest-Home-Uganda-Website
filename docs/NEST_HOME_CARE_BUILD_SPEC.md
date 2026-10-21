# Nest Home Care Uganda: Build Specification

**Version 1.1 · React (Vite, TypeScript) frontend · FastAPI backend · MongoDB · modular on both sides**

> **Changes in 1.1** (from the owner’s answers): MongoDB replaces PostgreSQL (Sections 1, 8, 9); React + Vite stays, with pre-rendering for the owner’s SEO programme (10.3, 11); the site is built multilingual from day one, launching in English (new Section 17); pricing is “free assessment, then a quote” (5.6); SMS goes through MambaSMS behind a provider interface (9.8); hosting is portable between Render and Northflank, with the Vercel free domain used for client review (15); S3-compatible storage confirmed.

This is the single build document for developers. It turns the approved design (the "Nest" look with hints of Fresh and Golden), the sitemap, the admin panel and the forms into exact, buildable detail.

---

## 0. How to use this document

### 0.1 Source of truth, in order

1. **This document** for everything to be built.
2. `reference/nest-home-care-complete.html` for how it looks and behaves. When a number here and the reference disagree, **the reference HTML wins**; fix this document.
3. `docs/nest-home-care-design-system.md` for the original single-page style guide (older; see Appendix B for known differences).
4. `docs/Nest_Home_Care_Uganda_Website_Project_Master_Document.md` for business goals, roles and process.
5. `docs/design-chat-transcript.md` for the reasoning behind decisions.

### 0.2 What the reference HTML is, and is not

- It shows every public page and every admin screen at phone, tablet and desktop widths.
- It uses CSS **container queries** (`@container`) only because the preview shows the site inside a resizable frame. **Production must use normal media queries at the same widths**: `min-width: 700px` and `min-width: 1040px`. Where the reference uses `cqi` units, use `vw` instead.
- Form submissions and admin edits in it live only in memory. Production persists them through the API.
- Placeholder content is marked "client to supply" in Section 12.

### 0.3 Decisions already made (do not reopen)

| # | Decision |
| --- | --- |
| 1 | The client chose the **Nest** direction: forest green and gold, egg shapes, woven edge. |
| 2 | Hints of Fresh (mint sections, arches, white cards, leaf green) and Golden (thin gold lines, diamond markers, gold italic accent words, gold-ringed circles) are included. |
| 3 | The home hero shows **three eggs**, not a mix of shapes. |
| 4 | Multi-page site with 11 page types (Section 5). |
| 5 | Phone, tablet and desktop each have their own layout rules (Section 4.6). |
| 6 | Contact and booking launches with **both** Call/WhatsApp buttons **and** a saved form (hybrid, Section 6). |
| 7 | An admin panel controls enquiries, careers, content and site variables (Section 7). |
| 8 | Service cards carry photos where available; four services use a green icon tile until real photos arrive. |
| 9 | Database is **MongoDB** (owner’s preference). |
| 10 | Frontend is **React + Vite** (the owner runs an SEO programme built around it); no framework change. |
| 11 | **English at launch**, but every piece of text is built to be translated into local languages first, then international ones (Section 17). |
| 12 | Pricing is **free assessment, then a quote**; no public prices at launch. |
| 13 | Hosting: **Vercel** (frontend) and **Render or Northflank** (backend; the backend is container-portable). The Vercel free domain is used for client review until the real domain is ready. |
| 14 | SMS provider: **MambaSMS**, used for notifications. File storage: **S3-compatible bucket**. The owner monitors the alerts. |

### 0.4 Assumptions made in this document (confirm or correct)

| # | Assumption | Why |
| --- | --- | --- |
| A1 | MongoDB runs on **MongoDB Atlas** (a managed replica set) | Render has no managed MongoDB; Northflank offers its own add-on, which the same code can use. |
| A2 | Styling is **plain CSS with design tokens and CSS Modules**, no Tailwind | The design depends on exact custom shapes and tokens. |
| A3 | Dark theme **ships** on the public site, following the system setting | It is in the approved tokens. |
| A4 | CVs are stored in a **private bucket** with time-limited links | Privacy of applicants. |
| A5 | Email goes through one provider interface (SMTP or a transactional service) | Provider not chosen yet. |
| A6 | The MambaSMS request format is **not verified in this document** | Check their API documentation before building `MambaSmsProvider` (9.8). |

---

---

## 1. Technology and project layout

### 1.1 Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 18, Vite, TypeScript (strict), React Router 6, TanStack Query 5, React Hook Form + Zod, react-i18next, react-helmet-async, CSS Modules + a global tokens file |
| Fonts | Fraunces (700), Figtree (400, 500, 600, 700), Cormorant Garamond italic (600), self-hosted WOFF2 with `font-display: swap` |
| Backend | Python 3.12, FastAPI, Pydantic v2, **Beanie** (async ODM on Motor) for MongoDB, versioned migration scripts for indexes and data fixes |
| Auth | Email and password (argon2id), short-lived JWT access token + rotating refresh token in an `HttpOnly; Secure; SameSite=Lax` cookie, optional TOTP two-step |
| Jobs | APScheduler in-process for reminders and daily summary at launch; move to ARQ/Redis only if volume needs it |
| Storage | S3-compatible buckets (one public-read for media, one private for CVs) behind a `StorageService` interface |
| Messaging | MambaSMS for SMS and one email provider, each behind a provider interface (9.8) |
| Hosting | Vercel (frontend); Render or Northflank (backend container); MongoDB Atlas (database) |
| Testing | Vitest + React Testing Library + Playwright (frontend); pytest + httpx + a test MongoDB (backend) |

### 1.2 Repository layout (monorepo)

```
nest-home-care/
├─ frontend/
│  ├─ index.html
│  ├─ vite.config.ts
│  └─ src/
│     ├─ app/                 # router, providers, layouts, error boundary
│     │  ├─ router.tsx
│     │  ├─ PublicLayout.tsx  # header, footer, sticky bar, outlet
│     │  └─ AdminLayout.tsx   # sidebar / bottom nav / top bar, outlet
│     ├─ design/
│     │  ├─ tokens.css        # Section 2 verbatim
│     │  ├─ global.css        # reset, base type, focus ring, reduced motion
│     │  └─ shapes.module.css # .egg .arch .circle .pill
│     ├─ components/
│     │  ├─ ui/               # Button, Rule, AccentText, Chip, Field, Badge, Toggle, Tabs, Accordion, Table, Modal
│     │  ├─ brand/            # Logo, Weave, Eggs
│     │  └─ site/             # Header, Footer, StickyBar, PageHero, Strip, Section, ServiceCard, Rings, Steps, TeamCard, PriceCard, JobCard, MapPlaceholder, BookingForm
│     ├─ features/
│     │  ├─ public/           # one folder per page: home, services, service-detail, about, team, how-it-works, areas, faq, careers, contact, privacy
│     │  └─ admin/            # auth, dashboard, enquiries, jobs, applications, content, settings, users, reports, activity
│     ├─ locales/             # {lang}/{namespace}.json interface strings (Section 17)
│     ├─ lib/                 # apiClient.ts, whatsapp.ts, phone.ts, format.ts, seo.tsx
│     ├─ hooks/               # useSiteSettings, useMediaQuery, useAuth
│     └─ types/               # generated from the OpenAPI schema
├─ backend/
│  ├─ pyproject.toml
│  ├─ Dockerfile
│  ├─ migrations/          # versioned index and data scripts
│  └─ app/
│     ├─ main.py
│     ├─ core/                # config, security, db, deps, errors, logging, rate_limit, storage
│     └─ modules/             # one package per domain (Section 9.2)
├─ docs/                      # this spec, master document, design system, transcript
├─ reference/                 # the HTML previews
└─ .env.example
```

### 1.3 Module rule

Every backend module and every frontend feature is **self-contained**: it exposes one public entry point (a router on the backend, a route object on the frontend) and imports other modules only through their public entry points. No module reaches into another module's database tables except through that module's `service.py`.

---

## 2. Design tokens

Put these in `frontend/src/design/tokens.css`. A copy is in `design/tokens.css` in this package.

### 2.1 Public site colours

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#F3F8F1` | `#0C1A12` | Page background |
| `--mint` | `#DFF0E6` | `#12281D` | Alternate section background |
| `--surf` | `#FFFFFF` | `#14271C` | Cards, forms, inputs' surround |
| `--ink` | `#123524` | `#E8EFE2` | Text and headings on light surfaces |
| `--mut` | `#4A6354` | `#9DB5A4` | Secondary text |
| `--forest` | `#123524` | `#091410` | Header, hero, dark bands, footer |
| `--leaf` | `#1F8A5B` | same | Service icons, "Per visit" tags |
| `--moss` | `#2F6B4A` | same | Selected chips, third egg, weave fill |
| `--gold` | `#C79A3B` | same | Buttons, lines, accents, step numbers, strip |
| `--straw` | `#E9DDB8` | `#3A3620` | First egg, photo placeholder stripes |
| `--line` | `#CBD8C6` | `#244233` | Borders |
| `--onf` | `#F4F1DF` | same | Text on forest |

Fixed colours (never change per theme or per admin setting): WhatsApp `#25D366` with text `#06260F`; text on gold `#1B1706`; text on straw egg `#2A2410`; gold hairline `rgba(199,154,59,.4)`; gold halo `rgba(199,154,59,.35)`; danger `#B3261E`.

Dark theme applies under `@media (prefers-color-scheme: dark)` unless `:root[data-theme="light"]`, and under `:root[data-theme="dark"]`.

**Colour rules**

1. Gold is for action and emphasis only. Never gold body text on white.
2. Text on forest is `--onf`, never pure white (except the moss egg label, which is `#FFFFFF`).
3. Text on gold is `#1B1706`.
4. WhatsApp green is used only for WhatsApp actions.
5. Sections alternate dark, light, mint, dark. Never two dark sections back to back, except the closing call-to-action band, which may follow a mint section.

### 2.2 Admin colours

The admin reuses the public tokens (light only) plus these:

| Token | Value | Use |
| --- | --- | --- |
| Badge default | bg `#E3EEE6`, text `#1B5E3B` | Live, Care started, Active, Approved |
| Badge `n` (new) | bg `#FFF1CC`, text `#7A5A00` | New, Draft, Pending, Received, Invited |
| Badge `b` (blue) | bg `#DCEBFA`, text `#1B4F8A` | Contacted, Shortlisted, Manager |
| Badge `r` (purple) | bg `#EDE6F7`, text `#4B2E83` | Assessment booked, Interview, Owner |
| Badge `x` (red) | bg `#F4E1DF`, text `#8A2C24` | Not proceeding, Closed, Declined |
| Danger button | text `#B3261E`, border `#E8B7B3` | Close job, Delete |
| Switch off | `#C9D2CB` | Toggle track (on = `--leaf`) |

### 2.3 Typography

| Role | Font | Fallback |
| --- | --- | --- |
| `--serif` headings | Fraunces 700 | Georgia, serif |
| `--sans` body and interface | Figtree 400/500/600/700 | system-ui, sans-serif |
| `--script` accent words | Cormorant Garamond italic 600 | Georgia, serif |

Headings use `letter-spacing: -0.01em` and `line-height: 1.1`. The accent word (`<AccentText>`) is Cormorant Garamond italic 600 in `--gold`, `letter-spacing: 0`. **One accent phrase per heading, never more.**

| Element | Mobile | Tablet and up | Weight | Line height |
| --- | --- | --- | --- | --- |
| Body | 16px | 16px | 400 | 1.55 |
| Home hero H1 | `clamp(2.4rem, 10vw, 4.5rem)` | same formula, capped at 4.5rem | 700 serif | 1.1 |
| Page hero H1 | `clamp(2rem, 8vw, 3.6rem)`, max-width 18ch | same | 700 serif | 1.1 |
| Service page H1 (≥1040px) | – | `clamp(2.8rem, 5.2vw, 4.2rem)` | 700 serif | 1.1 |
| Section H2 | `clamp(1.7rem, 6vw, 2.8rem)`, max-width 20ch | same | 700 serif | 1.1 |
| Hero lead | 1.1rem, max 34ch, opacity .92 | same | 400 | 1.55 |
| Page hero lead | 1.08rem, max 46ch, opacity .9 | same | 400 | 1.55 |
| Section subtext | 1rem, `--mut`, max 54ch | same | 400 | 1.55 |
| Step title H3 | 1.2rem | 1.2rem | 700 serif | 1.1 |
| Card title H3 | 1.08rem | 1.08rem | 700 sans | 1.2 |
| Card text | .92rem `--mut` | same | 400 | 1.55 |
| Ring title | 1.4rem | 1.4rem | 700 serif | – |
| Ring text | .88rem, opacity .85 | same | 400 | – |
| Egg title | 1.25rem | 1.25rem | 700 serif | – |
| Egg caption | .82rem | .82rem | 600 | 1.2 |
| Team name | 1rem | 1rem | 700 sans | – |
| Team role | .88rem `--mut` | same | 400 | – |
| Section label (`Rule`) | .74rem, uppercase, tracking .14em, gold | same | 600 | – |
| Button | .98rem | .98rem | 600 | – |
| Header button | .88rem | .88rem | 600 | – |
| Nav link | .92rem, opacity .88 | same | 500 | – |
| Brand name | 1rem serif | 1rem | 700 | 1.05 |
| Brand sub-line | .68rem sans, gold | same | 500 | – |
| Footer | .92rem | same | 400 | – |
| Footer heading | .78rem uppercase tracking .12em gold | same | 700 | – |
| Breadcrumb | .82rem, opacity .75 | same | 400 | – |

Typographic apostrophes and quotation marks (’ “ ”) in all visible text. Straight quotes only in code.

### 2.4 Spacing, radii, borders

| Token | Value |
| --- | --- |
| Container | `max-width: 1180px; margin: 0 auto; padding: 0 20px` (mobile), `0 34px` (≥700px) |
| Section padding | 52px top and bottom; 84px at ≥1040px |
| Home hero padding | top 40px (mobile), 64px (≥1040px); no bottom (weave sits flush) |
| Page hero padding | 34px top, 40px bottom; 56px / 64px at ≥1040px |
| Service-page hero padding | 34px / 40px mobile; 48px / 56px ≥700px; 76px / 84px ≥1040px |
| Grid gap | 12px (cards), 14px (team, prices), 20px (rings), 22px (steps mobile), 24px (steps ≥700px), 30px (two-column content), 56px (service page content and aside), 60px (about and contact columns at ≥1040px) |
| Grid margin-top after intro | 28px (cards, steps, team), 30px (rings), 18px (lists) |
| Radii | Card 24px; Form 28px; Job 22px; Price 26px; Input 14px; FAQ row 18px; List row 18px; Map 24px; Mobile menu button 12px; Pill 999px |
| Borders | Cards `1px solid --line`; featured price card `2px solid --gold`; form `1px solid --gold`; team photo `2px solid --gold`; inputs `2px solid --line` |
| Shadows | Sticky bar buttons `0 6px 16px rgba(0,0,0,.3)`; no other shadows on the public site |

### 2.5 Shapes (`shapes.module.css`)

| Shape | CSS | Used for |
| --- | --- | --- |
| Egg | `border-radius: 50% 50% 50% 50% / 62% 62% 38% 38%` | Hero eggs, step numbers |
| Arch | `border-radius: 999px 999px 18px 18px` | Service icons and thumbs, team photos, service-page hero photo |
| Circle | `border-radius: 50%` | Rings |
| Pill | `border-radius: 999px` | Buttons, chips |
| Diamond | 6px square, 1.5px gold border, rotated 45° | Section label end, list bullets (9px, 2px border) |

### 2.6 Breakpoints

| Name | Range | Production media query |
| --- | --- | --- |
| Phone | under 700px | default styles |
| Tablet | 700px to 1039px | `@media (min-width: 700px)` |
| Desktop | 1040px and up | `@media (min-width: 1040px)` |

Test at 390, 820, 1024, 1280 and 1920px.

### 2.7 Motion and focus

- Smooth scrolling for anchors. Accordion arrow (`+` / `−`) swaps with no animation.
- Hero eggs may rise in on load: `translateY(40px)` to 0 with fade, 0.9s, `cubic-bezier(.2,.8,.2,1)`, delays 0s, .12s, .24s.
- Button hover: `filter: brightness(1.07)`. Card hover: border colour to `--gold`.
- Everything animated is disabled under `prefers-reduced-motion: reduce`.
- Focus ring on every interactive element: `3px solid --gold`, `outline-offset: 2px`.
- No parallax, carousels or auto-playing media.

---

## 3. Brand assets

### 3.1 Logo (inline SVG component `<Logo />`)

`viewBox="0 0 40 34"`, rendered 36 × 30 in the header and 30 × 26 in the admin sidebar.

- Gold cross: line `20,1 → 20,7` and `17,4 → 23,4`, stroke `#C79A3B`, width 2, round caps.
- Three ellipses: `cx14 cy16 rx5 ry6.5` fill `#E9DDB8`; `cx22 cy14.5 rx5 ry6.5` fill `#F4F1DF`; `cx29 cy17 rx4.5 ry6` fill `#E9DDB8`.
- Nest arcs, stroke `#C79A3B`, width 1.8, round caps: `M3 21c4 11 30 11 34 0`, `M6 23c6 7 22 7 28 0`, `M10 26c5 4 15 4 20 0` (the admin uses only the first arc).
- Beside it: "Nest Home Care" and, below, "Uganda · Kampala" (admin: "Nest Admin" and "Home Care Uganda").
- Clear space equals one egg height. Never place the logo on gold.

### 3.2 Weave

Full-width SVG under the home hero: `viewBox="0 0 1200 46"`, `preserveAspectRatio="none"`, height 46px, margin-top 8px. Fill path `M0 20c200 30 400 30 600 16S1000 6 1200 20v26H0z` in `--moss`; stroke path `M0 14c200 26 420 26 600 12s400-22 600-10` in `--gold`, width 2.

### 3.3 Favicon and meta

Favicon 🪺 until a real icon is supplied (admin Appearance setting). Default title `Nest Home Care Uganda | Compassionate Home Care in Kampala`. Default description `Trained nurses for elderly care, newborn care, wound care and more, at home across Kampala. Call 0787 499 988.`

### 3.4 Images

| File | Used for |
| --- | --- |
| `assets/images/service-0-elderly.jpg` | Elderly and companion care card |
| `assets/images/service-1-postnatal.jpg` | Postnatal card and the service-page arch photo |
| `assets/images/service-2-wound-care.jpg` | Wound care card |
| `assets/images/service-5-chronic.jpg` | Chronic disease card (blood pressure check) |

These were cropped from the client's flyer and are small. **Request the original photos.** Target for production images: WebP, under 200 KB each, `srcset` at 480, 800 and 1280px wide, explicit `width` and `height`, descriptive alt text. Service 3, 4, 6 and 7 use the icon tile (Section 4.9) until photos arrive.

---

## 4. Component specification

Each component is a React component with CSS Module styles. Props are TypeScript interfaces. "Admin-controlled" means the value comes from settings or content (Section 7.8).

### 4.1 Button (`ui/Button`)

| Variant | Background | Text | Border |
| --- | --- | --- | --- |
| `primary` | `--gold` | `#1B1706` | 2px `--gold` |
| `outline` | transparent | inherit (`--onf` on dark) | 2px currentColor |
| `whatsapp` | `#25D366` | `#06260F` | 2px `#25D366` |

Min height 46px, padding `0 22px`, pill, Figtree 600 .98rem, inline-flex centred. Header size: min height 40px, padding `0 14px`, .88rem. Form buttons are full width. Renders `<a>` when given `href` (tel, wa.me, internal `Link`) and `<button type="button">` otherwise.

### 4.2 Rule label (`ui/Rule`)

Flex row, gap 10px, margin-bottom 12px. A 30px × 1px gold line, then the uppercase label (Section 2.3), then a 6px diamond. In centred sections the row is centred.

### 4.3 Header (`site/Header`)

- Sticky, top 0 (plus `env(safe-area-inset-top)`), z-index 9, background `--forest`, text `--onf`, bottom border `1px rgba(199,154,59,.4)`. Inner container height 62px, space-between.
- Left: `<Logo />` and name, clickable to `/`.
- Centre (≥700px): nav **Services · About · How it works · Careers · Contact**, gap 22px, `<nav aria-label="Main">`. Hover: text turns gold, opacity 1. The Services item opens a dropdown listing the 8 services at ≥1040px (hover and keyboard focus; never hover-only, it must also open on click).
- Right: gold button **Call** (`tel:` dial from settings). At ≥700px the label may read "Call 0787 499 988" if the width allows; below 700px it reads "Call".
- Below 700px: a 44 × 40px menu button (border 2px gold, radius 12px, gold ☰) toggles a panel: forest background, top border `1px rgba(199,154,59,.3)`, padding `6px 20px 14px`, full-width rows 46px high. The panel closes on route change and on Escape.

### 4.4 Footer (`site/Footer`)

Forest, top border `1px rgba(199,154,59,.4)`, padding `34px 0 24px`, .92rem. Three columns at ≥700px (one on phone), gap 22px:

1. **Nest Home Care**: "Trusted · Reliable · Compassionate. Office: Kampala · {phone}".
2. **Explore**: Services, Our team, Areas we serve, FAQ and care tips.
3. **Company**: About us, Careers, Contact, Privacy and terms.

Links are buttons or anchors, padding 5px 0, opacity .85. Bottom line centred: "© Nest Home Care Uganda", .84rem, opacity .7, margin-top 22px. Social icons render only if URLs are set in settings.

### 4.5 Sticky action bar (`site/StickyBar`)

Below 1040px only. `position: sticky; bottom: 8px` (use `position: fixed` with `bottom: calc(8px + env(safe-area-inset-bottom))` in production), left/right 10px, z-index 8, gap 8px. Two equal buttons: **Call now** (primary) and **WhatsApp** (whatsapp), with shadow. The page adds 84px bottom padding so the bar never covers content. Hidden at ≥1040px. Admin toggle "Show sticky Call and WhatsApp bar".

### 4.6 Responsive behaviour summary

| Section | Phone | Tablet | Desktop |
| --- | --- | --- | --- |
| Header | Logo, Call, menu button | Full nav, Call | Full nav with Services dropdown, Call |
| Home hero | One column, eggs below text, art height 300px, max-width 420px | Two columns `1.1fr .9fr`, art 340px, max-width 500px | Same columns, gap 56px, art 380px, max-width 540px |
| Service cards | 1 column, arch thumb left | 2 columns, photo above (190px tall) | 4 columns, photo above (150px tall) |
| Rings | Stacked, centred | 3 across | 3 across |
| Steps | Vertical, number left | 3 columns, number above | 3 columns |
| Team | 2 columns | 4 columns | 4 columns |
| Page content blocks | One column | Two columns for lists and about | Content left, sticky booking card right on the service page |
| Contact | Stacked | Stacked | Two columns `1.1fr .9fr`, gap 60px |
| Sticky bar | Shown | Shown | Hidden |
| Admin | Bottom navigation, cards instead of tables | 76px icon sidebar, cards instead of tables | 244px labelled sidebar, real tables |

Rules: cap content at 1180px and text lines at about 60 to 70 characters; change the arrangement, not only the size; never rely on hover for essential information.

### 4.7 Home hero eggs (`brand/Eggs`)

Container `.art`: relative, width 100%, centred; heights per 4.6. Three absolutely-positioned eggs, each `aspect-ratio: .76`, text at the bottom centre, padding `0 8px 18px`:

| # | Width | Left / right | Top | Fill | Text | Rotation | z |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 34% | left 0 | 30% | `--straw` | `#2A2410` | −7° | 1 |
| 2 | 40% | left 30% | 0 | `--gold` | `#1B1706` | 0° | 2 |
| 3 | 34% | right 0 | 36% | `--moss` | `#FFFFFF` | +8° | 1 |

All three use the egg shape. Title (egg title style) over a caption. Defaults: **Elders / with dignity**, **Newborns / and mothers**, **Recovery / after surgery**. Text is admin-controlled. Role: `role="img"` on the container with an `aria-label` describing the three eggs; decorative inner text is part of the label.

### 4.8 Strip (`site/Strip`)

Gold background, `#1B1706` text, centred, 600 weight, .92rem, padding `11px 16px`. Home text is admin-controlled: "Home visits across Kampala and surrounding areas". The service page uses a three-fact strip: "Qualified nurses · Care plan agreed with you · Kampala and surrounds".

### 4.9 Service card (`site/ServiceCard`)

`<Link>` styled as a card: `--surf` background, 1px `--line` border, radius 24px, padding 20px, gap 14px, text left-aligned, hover border `--gold`. Content: H3 name and a one-line summary.

- **Phone:** row layout. Thumb on the left: 68 × 84px, arch shape, 2px gold border, cover-fitted photo.
- **Tablet and up:** column layout. Thumb becomes full width, 190px tall (150px inside the 4-column desktop grid), radius 18px.
- **Without a photo:** the thumb is `--leaf` with a 34px (52px on tablet, 48px in the desktop grid) gold line icon (stroke `#E9C46A`, width 1.6, round caps). Icons: physiotherapy (figure), palliative (heart), pediatric (child head), hospital to home (house). Replace with a photo when `service.photo_id` is set; the admin Media library supplies it.
- Each card links to `/services/{slug}`.

### 4.10 Rings (`site/Rings`)

Three circles, 180 × 180px, border 2px `--gold`, padding 16px, content centred, outline `1px rgba(199,154,59,.35)` with `outline-offset: 7px`. Title (ring title) over text. Stacked and centred on phone (gap 20px), three across from 700px. Used in "Our promise" on Home and "What we stand for" on About. Defaults: **Trusted** (Qualified, ID-wearing nurses), **Reliable** (On time, every visit), **Compassionate** (Care with dignity). On About, "Trusted" reads "Vetted, qualified nurses".

### 4.11 Steps (`site/Steps`)

Phone: each step is a grid `52px 1fr`, gap 14px, steps 22px apart. Tablet and up: three columns, number above text. Number: 52 × 62px egg, `--gold` fill, `#1B1706` text, serif 700 1.3rem. The design system's dotted gold connector line (3px dotted, vertical on phone, horizontal from tablet) is **added in production** (the preview omits it): it runs from the number to the next step.

| Step | Title | Text |
| --- | --- | --- |
| 1 | Call or WhatsApp us | Tell us who needs care. No jargon, no pressure. |
| 2 | We agree a care plan | A nurse sets out what care is needed and when. |
| 3 | Care begins at home | Your nurse arrives in uniform with ID. |

### 4.12 Team card (`site/TeamCard`)

Centred. Photo frame: arch, `aspect-ratio: 3/4`, 2px gold border, margin-bottom 10px. Placeholder: `repeating-linear-gradient(135deg, --straw 0 8px, transparent 8px 16px)` on `--surf` with the word "Photo" (.78rem `--mut`). Under it: name (team name style) and "Role and qualification" (team role style). Photo alt text: "{name}, {role}". Grid: 2 columns phone, 4 columns from 700px, gap 14px. Photo guidance: portrait crop 3:4, face centred in the upper two thirds, green scrubs, plain or natural background, under 200 KB.

### 4.13 FAQ accordion (`ui/Accordion`)

Native `<details>`/`<summary>` for accessibility. Row: `--surf`, 1px `--line` border, radius 18px, margin-top 10px, padding `0 18px`. Summary: min height 54px, flex space-between, 600 weight, marker removed, trailing `+` (gold, 1.5rem) that becomes `−` when open. Answer: `--mut`, padding-bottom 16px.

### 4.14 List (`ui/CheckList`)

Grid, gap 10px, margin-top 18px; two columns from 700px. Each row: `--surf`, 1px `--line` border, radius 18px, padding `14px 16px`, a 9px diamond bullet (2px gold border, margin-top 8px) and text.

### 4.15 Price card, job card, info card, map placeholder

| Component | Spec |
| --- | --- |
| Price card | `--surf`, 1px `--line`, radius 26px, padding 24px. Featured: 2px `--gold` border. Tag: .72rem uppercase tracking .12em, `--leaf`, 700. Title 1.3rem serif. Text `--mut`. Three across from 700px (gap 14px). |
| Job card | `--surf`, 1px `--line`, radius 22px, padding 18px, grid gap 10px, margin-top 12px. Title 1.1rem sans 700; meta .9rem `--mut`. From 700px: `1fr auto` with the Apply button on the right, vertically centred. |
| Info card (contact, on light) | `--surf`, 1px `--line`, radius 18px, padding `14px 16px`; label in gold 700 above the value. |
| Map placeholder | `aspect-ratio: 16/10`, radius 24px, `2px dashed --gold`, `--surf` background, centred `--mut` text. Production: an embedded map (see 5.8). |
| Area chip | padding `9px 16px`, pill, 2px `--line` border, `--surf`, 500 weight. |

### 4.16 Form controls (`ui/Field`)

Label: block, 600 weight, .92rem, margin-bottom 5px. Input, select, textarea: full width, min height 48px, 2px `--line` border, radius 14px, padding `0 12px`, font 400 1rem, background `--bg`, text `--ink`, margin-bottom 12px. Textarea: min height 80px, padding `10px 12px`. Error state: border `#B3261E` plus an error message below in `#B3261E`, .88rem, linked with `aria-describedby`. Required fields marked with "(required)" in the label text, not colour alone.

**Care chips** (multi-select, used in the booking form): min height 44px, padding `0 14px`, pill, 2px `--line` border, `--bg` background, .95rem 500; selected (`aria-pressed="true"`): `--moss` background and border, white text. The reference preview shows a single dropdown for care type; **production uses chips** (multi-select) as in the original approved design and as specified in Section 6.

### 4.17 Page hero (`site/PageHero`)

Forest background, `--onf` text. Breadcrumb ("Home / Services / …", links underlined, .82rem), Rule label, H1, lead. Variant `withPhoto` (service detail): at ≥700px two columns `1fr 320px` gap 40px, vertically centred; at ≥1040px `1fr 420px` gap 80px. Photo: arch, 2px gold border, `aspect-ratio: 3/4`, `box-shadow: 0 0 0 10px rgba(199,154,59,.16)` (the soft gold halo), width `min(260px, 72%)` on phone, 100% of its column from 700px; background `--moss` until loaded.

### 4.18 Call-to-action band (`site/CtaBand`)

Forest, centred, section padding. H2 (max 20ch, centred) and two buttons centred: primary **Book a home visit** (to `/contact`) and WhatsApp **WhatsApp us**. Appears at the end of every public page except Contact and Privacy. Heading text per page in Section 5.

### 4.19 Admin components

| Component | Spec |
| --- | --- |
| Sidebar | Forest, padding `14px 10px`, gap 2px. Group labels "Work" and "Manage" (.68rem uppercase gold). Items: 44px min height, radius 12px, 20px stroke icon, label .9rem 600. Current item: gold background, `#1B1706` text. Hover: `rgba(255,255,255,.08)`. Sign out pinned at the bottom. Icon-only at 700 to 1039px (76px wide); 244px with labels at ≥1040px; hidden below 700px. |
| Bottom nav (phone) | Forest, five items: Home, Enquiries, Careers, Content, More. Item min height 54px, icon over label (.68rem), current item gold. "More" opens a list of Applications, Site settings, Users and roles, Reports, Activity log and Sign out. |
| Top bar | Sticky, 58px, `--surf`, bottom border `--line`. Page title (serif 1.1rem) left; user name and role with a 34px gold initial circle right. |
| Page content | Padding `18px 16px 28px` (`24px 28px 36px` from 700px), max-width 1200px. |
| Page header | Title (serif 1.5rem), optional .9rem `--mut` subtitle, actions on the right (wrap on phone). |
| Stat card | `--surf`, 1px `--line`, radius 18px, padding 14px; number serif 1.8rem; label .82rem `--mut`. "Attention" cards use a 2px gold border. Two columns on phone, four from 700px. |
| Box | `--surf`, 1px `--line`, radius 20px, padding 16px, margin-bottom 14px; H3 serif 1.1rem. |
| Data table | At ≥1040px a real table in a rounded wrapper (radius 20px, padding `6px 10px`): header .72rem uppercase tracking .08em `--mut`; cells padding 12px; row hover `--mint`. Below 1040px each row becomes a card (radius 16px, padding `12px 14px`): first cell bold 1rem, other cells show a small `label:` prefix. Rows are clickable when they open a detail screen. |
| Tabs (filters) | Horizontally scrollable row, gap 6px. Tab: min height 38px, padding `0 14px`, pill, 2px `--line` border; selected: forest background, `--onf` text. |
| Badge | Pill, padding `3px 10px`, .72rem 700, colours per 2.2. |
| Toggle switch | 48 × 28px track, 22px white knob, 3px inset; on = `--leaf`. Always has an accessible name and `aria-pressed`. |
| Chip with remove | Pill, padding `7px 8px 7px 14px`, 2px `--line` border, a 22px round × button; "+ Add" outline small button ends the row. |
| Bar chart | Seven bars, 120px tall area, `--leaf` bars with the current day in `--gold`, 8px gap, day labels .7rem below. Replace with a real chart component fed by the dashboard endpoint. |
| Timeline | Left border 2px gold, 6px margin-left, item padding `8px 0 8px 18px`, small muted timestamp under each event. |
| Login | Forest full-screen, centred white card (radius 28px, padding `28px 24px`, max 400px, 1px gold border). |

---

## 5. Public pages

Routes use React Router. Every page sets its own `<title>`, meta description, canonical URL and Open Graph tags through `lib/seo.tsx`. Every page includes the header, footer and sticky bar (Sections 4.3 to 4.5) and, unless stated, ends with the CTA band.

| # | Route | Page |
| --- | --- | --- |
| 1 | `/` | Home |
| 2 | `/services` | Services overview |
| 3 | `/services/:slug` | Service detail (8 pages) |
| 4 | `/about` | About us |
| 5 | `/team` | Our team |
| 6 | `/how-it-works` | How it works and pricing |
| 7 | `/areas` | Areas we serve |
| 8 | `/faq` | FAQ and care tips (articles at `/faq/:slug`, phase 3) |
| 9 | `/careers` | Careers (jobs at `/careers/:id`) |
| 10 | `/contact` | Contact and book |
| 11 | `/privacy` | Privacy and terms |
| – | `*` | 404: forest page hero "We couldn’t find that page.", buttons Home and Contact |

Main menu: Services · About · How it works · Careers · Contact. Areas, FAQ, Team and Privacy sit in the footer.

### 5.1 Home (`/`)

Order, with backgrounds: Header (forest) → Hero + weave (forest) → Strip (gold) → Services (mint) → Our promise (forest) → How it works (page) → Team preview (mint) → CTA band (forest).

| Block | Content and rules |
| --- | --- |
| Hero | Rule "Compassionate home care". H1 "Care that *comes home* to you." (accent phrase admin-controlled). Lead "Trained, caring nurses for your parents, your newborn and your recovery, in your own home across Kampala." CTAs: primary "Book a home visit" (`/contact`), outline "Our services" (`/services`). Right: three eggs (4.7). |
| Weave | 4.2 / 3.2. |
| Strip | Admin text. |
| Services | Rule "What we do". H2 "Eight kinds of care, one *trusted* team." 8 service cards, grid 1 / 2 / 4 columns. |
| Our promise | Centred. Rule "Our promise". H2 "Home-based care for *Ugandan families.*" Three rings. |
| How it works | Rule "How it works". H2 "From first call to *first visit.*" Three steps. |
| Team preview | Rule "Our team". H2 "Faces you can trust *at your door.*" Four published team members (first four by order). Hidden when admin toggle "Show team preview on Home" is off. |
| Testimonials | Hidden by default. When enabled in settings: a three-card row of approved testimonials (first name and area only) between How it works and Team. |
| CTA band | "Ready when your family is." |

### 5.2 Services overview (`/services`)

Page hero: Rule "Services", H1 "Eight kinds of care, one trusted team.", lead "Everything your family needs, delivered at home." Breadcrumb "Home / Services". Body: the 8 service cards, 1 / 2 / 4 columns. CTA band: "Not sure which care you need?"

### 5.3 Service detail (`/services/:slug`)

Eight pages from one template. Content comes from the `services` table. The postnatal page is the reference.

| Block | Rules |
| --- | --- |
| Page hero with photo | Breadcrumb "Home / Services / {name}", Rule (service label, e.g. "Mother and baby"), H1 (service headline), lead (one reassurance sentence). Photo in the arch, halo ring (4.17). Phone: text then photo; ≥700px: side by side. |
| Facts strip | Gold strip with three facts (4.8). |
| Content column | Order: "Who this care is *for*" (intro sentence, then four short cards); "What a visit *includes*" (check list, 5 to 8 items); "How it *works*" (three steps); "Common *questions*" (3 to 6 accordion items, filtered from FAQs linked to this service plus "all services"). Headings use serif H2; the second heading onwards has 34px top margin. |
| Booking card | **Desktop (≥1040px):** content left, a 380px column right, gap 56px, the card sticky at `top: 84px`. **Phone and tablet:** the card sits after the content, and the sticky bar stays. Card = `<BookingForm variant="service">` with title "Book this care" and the care type pre-selected. |
| Related services | Mint section, H2 "Related *services*", two or three service cards chosen in admin (default: next services in order). |
| CTA band | Not shown on this page (the booking card replaces it). |

**Sample copy for the postnatal page** (nurses must confirm every line before launch):

- Headline: "Postnatal and newborn care, at home." Lead: "A trained nurse supports you and your baby in the first weeks."
- Who it is for (four cards): New mothers recovering after birth · First-time parents · Families caring for a baby after hospital discharge · Mothers recovering after a caesarean.
- A visit includes: Checks on the mother’s recovery · Newborn bathing and cord care guidance · Feeding support and positioning · Wound and stitch care where needed · Rest, hygiene and nutrition advice · Danger-sign education.
- FAQ: How quickly can care start? · Are your nurses qualified? · How much does it cost? (answer left for client).

The other seven services follow the same fields. No copy is invented: until the client supplies it, the admin shows a "Content needed" badge and the page can stay unpublished.

### 5.4 About us (`/about`)

Page hero: Rule "About us", H1 "Care that treats your family as ours.", lead "Nest Home Care Uganda brings skilled, compassionate nursing into Ugandan homes." Blocks: (1) "Our *story*" text left with a photo slot right (two columns `1.1fr .9fr`, gap 60px at ≥1040px; the photo slot is a `MapPlaceholder`-style box labelled "Photo: the Nest team together" until supplied); (2) forest band "What we *stand for*" with three rings; (3) mint "Credentials and *registration*" check list: Business registration number · Professional council registration · Insurance and safety standards · Staff training and vetting process (each editable as content blocks); (4) CTA band "Meet the people who will care for you."

### 5.5 Our team (`/team`)

Page hero: Rule "Our team", H1 "Faces you can trust at your door.", lead "Every visit is made by a trained member of our team." Body: all published team members in the team grid (name, role, qualification). CTA band "Book a visit with our team."

### 5.6 How it works and pricing (`/how-it-works`)

Page hero: Rule "How it works", H1 "Clear steps, clear pricing.", lead "Know what happens and what it costs before we begin." Blocks: three steps; mint "Pricing" section: Rule "Pricing", H2 "Simple, *honest* prices.", three price cards (featured **Free assessment** tagged “Start here”: a nurse visits, listens and explains the care needed; **Your quote** tagged “After the assessment”: a clear written price for the care agreed; **Your care plan** tagged “Ongoing”: weekly or monthly care agreed with you), then the line “We will confirm accepted payment methods when we agree your plan.” No prices are shown at launch. Card text comes from the Pricing content type; if the client later chooses to publish prices, the “Show prices publicly” switch adds a price line to each card. CTA band "Book your free assessment."

### 5.7 Areas we serve (`/areas`)

Page hero: Rule "Areas we serve", H1 "Home visits across Kampala and surrounds.", lead "Check that we reach your neighbourhood." Body: area chips (default list in Section 12.3), the map (5.8), line "Not listed? Call us. We may still be able to help." CTA band "Is your area covered? Ask us."

### 5.8 Map

Production uses a privacy-friendly embed: OpenStreetMap tiles through a lightweight library (Leaflet) loaded only on the Areas and Contact pages, with the office marked from settings. If a Google Maps embed is preferred, load it only after the visitor taps "Show map" (performance on slow data). Same box: `aspect-ratio: 16/10`, radius 24px, border 2px dashed gold while loading.

### 5.9 FAQ and care tips (`/faq`)

Page hero: Rule "FAQ and care tips", H1 "Answers for worried families.", lead "Common questions, and short guides from our nurses." Two columns at ≥1040px (`1.1fr .9fr`): left, all FAQs as accordions grouped by service when linked; right, H2 "Care *tips*" with article cards (title and "Short article. Coming soon." until published). Articles (phase 3) open at `/faq/:slug` as a simple reading page: page hero with title, 62ch-wide body, related services, CTA band. CTA band "Still have a question?" Default FAQ: How quickly can care start? · Are your nurses qualified? · How much does it cost? · Which areas do you cover? · Can I choose the same nurse each time? · What if I need to cancel?

### 5.10 Careers (`/careers`, `/careers/:id`)

Page hero: Rule "Careers", H1 "Join the team that cares for Uganda’s families.", lead "We are always looking for kind, qualified nurses and carers." Two columns at ≥1040px. Left: "Open *roles*" (job cards: title, "Location · Type · Closes {date}", Apply button that opens the job and scrolls to the form) and "How hiring *works*" (check list: Apply with your CV · We review and shortlist · Interview · Licence and reference checks · Offer). Right: the application form (Section 6.3). A general "Register your interest" option appears in the role dropdown when no role is open. Closed or past-deadline roles disappear automatically.

### 5.11 Contact and book (`/contact`)

Page hero: Rule "Contact and book", H1 "Talk to us today.", lead "Call, WhatsApp or send a request. A nurse will reply shortly." Two columns at ≥1040px. Left: big **Call 0787 499 988** (primary) and **WhatsApp us** buttons, info cards "Office: Kampala, Uganda" and "Hours: {settings}", the map. Right: the booking form (Section 6.1). No CTA band and no sticky booking card on this page.

### 5.12 Privacy and terms (`/privacy`)

Page hero: Rule "Privacy and terms", H1 "Your information is safe with us.", lead "How we use and protect the details you share." Body text blocks (max 62ch): What we collect · How we use it · Your choices · Cookies · Data retention · Contact for data requests. The draft must be reviewed by a Ugandan lawyer before launch (Data Protection and Privacy Act, 2019). Content editable in admin as rich text.

---

## 6. Forms and enquiry flow

### 6.1 Booking form (Contact page and service-page card)

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| Your name | text | yes | 2 to 80 characters |
| Phone number | tel | yes | Uganda format, Section 6.4 |
| Who needs care | select | yes | Myself · My parent · My spouse · My child or baby · Someone else (admin-editable) |
| Care needed | chips, multi-select | yes (at least one) | The published services; pre-selected on a service page |
| Area | text with suggestions | yes | From the Areas list; free text allowed |
| Preferred start | select | no | Today · This week · Later · Not sure |
| Short note | textarea | no | Max 500 characters, counter shown. Hint: "No medical details here. The nurse will ask later." |
| Consent | checkbox | yes | "I agree that Nest Home Care may contact me about this request." with a link to `/privacy` |
| Honeypot | hidden text | – | Must be empty; humans never see it |

Layout: title, then the **Chat on WhatsApp** button (whatsapp variant, full width), then the line "or send a request", then the fields, then the primary full-width **Send request** button. Form card: `--surf`, radius 28px, padding `24px 20px`, 1px gold border.

### 6.2 Submit flow (hybrid, as agreed)

1. Validate on the client (Zod) and server (Pydantic). On errors, focus the first invalid field and show messages.
2. `POST /api/v1/public/enquiries`. The server saves the enquiry with status **New** and source `form`, sends alerts (Section 9.8), returns `{reference, whatsapp_url}`.
3. Replace the form with: heading "Thank you. A nurse will contact you shortly." (admin text), a **Continue on WhatsApp** button using the returned URL, and the line "Your request reference is {reference}."
4. If "Open WhatsApp after the form is sent" is on, also open the URL in a new tab, but only on a user gesture to avoid popup blocking; the Continue button is always shown.
5. If the API call fails, keep the form, show "We couldn’t send that. Please try WhatsApp or call us." with the two buttons, and keep the entered data.

**WhatsApp message** (prefix from settings): `Hello Nest Home Care, I would like to book: {services joined by ", "}. Name: {name}. Area: {area}. Ref: {reference}.` URL: `https://wa.me/{whatsapp_digits}?text={encodeURIComponent(message)}`. If no services are chosen the form cannot submit; the plain **Chat on WhatsApp** button uses `Hello Nest Home Care, I would like to ask about home care.`

**Click tracking.** Header Call, sticky bar and in-page Call and WhatsApp buttons send `POST /api/v1/public/clicks` (`{channel: "call" | "whatsapp", page}`) using `navigator.sendBeacon`. These are counted for the dashboard "sources" chart and create no enquiry.

### 6.3 Application form (Careers)

| Field | Type | Required |
| --- | --- | --- |
| Role applying for | select (pre-filled from the job) | yes |
| Full name | text | yes |
| Phone | tel | yes |
| Email | email | yes |
| Professional registration number | text | yes for clinical roles |
| Qualification | text | yes |
| Years of experience | number 0 to 50 | yes |
| Area of residence | text | yes |
| Availability and expected start | text | yes |
| CV | file, PDF/DOC/DOCX, max 5 MB | yes |
| Short cover note | textarea, max 1000 | no |
| Consent | checkbox | yes |
| Honeypot | hidden | – |

Submit as `multipart/form-data` to `POST /api/v1/public/applications`. Success: "Application received. Thank you, {name}. Our team will review your CV and contact you." Certificates, licences and references are requested later, not on this form. Applicants are told their data is kept for 12 months and may ask for deletion.

### 6.4 Validation details

- **Uganda phone:** accept `07xx xxx xxx`, `+2567xx xxx xxx`, `2567xxxxxxxx` (and `03xx` landlines). Regex on digits only: `^(?:\+?256|0)[37]\d{8}$`. Store the original and a normalised `+256…` value.
- Trim all text. Strip control characters. Reject strings containing links in the name field.
- Server rate limits: 5 enquiries per IP per hour; 3 applications per IP per day; both return `429` with a friendly message.
- Spam: honeypot, rate limit, a lightweight proof-of-work or Cloudflare Turnstile token (configurable; off in development).
- Accessibility: every field has a visible label; errors are announced with `role="alert"`; the thank-you receives focus.

---

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

### 7.3 Dashboard

Greeting "Good morning, {first name}" (by local time) with "Here is what needs attention today." Primary button "View enquiries".

- Four stat cards: New enquiries this week (attention), Unanswered over {reminder minutes} min (attention), Applications waiting, Care started this month.
- Left box "Enquiries per day": seven-day bar chart and a line "Sources: form 58% · WhatsApp 31% · call 11%" (computed).
- Right box "Needs a reply": enquiries with status New (name, service, area, New badge), each opening the detail; below it "Applications waiting" grouped by job with a Review badge.

### 7.4 Enquiries

- List: search (name, phone, area), status tabs (All, New, Contacted, Assessment booked, Care started, Not proceeding), filters for service, area, assigned user and date range, sort by date. Columns: Name, Phone, Service, Area, Status, Received, Assigned. Pagination 25 per page. "Export CSV" button.
- Detail: header with name and "Enquiry · received {time} via {source}"; "Request" box with phone, area, care needed, who needs care, preferred start, source and the family’s note; **Call** (primary, `tel:`) and **WhatsApp** (whatsapp variant, `wa.me/{digits}`) buttons; "Add a note" box; "Status" box (status, assigned to, reason if not proceeding, Update); "Timeline" box (received, alert sent, status changes, notes, with user and time).
- Statuses: New · Contacted · Assessment booked · Care started · Not proceeding (reason: Price, No capacity, Outside area, Other) · Spam (hidden from lists and reports unless filtered).
- Rule: moving a status from New for the first time records `first_contacted_at` (for the average first-reply figure).

### 7.5 Careers and applications

- **Jobs list** columns: Role, Location, Type, Closing, Applicants, Published (Live, Closed, Draft badges). Row opens the editor.
- **Job editor** fields: Job title; Department (Clinical, Care, Admin); Location; Type (Full-time, Part-time, Contract); Closing date; Registration required (yes/no); Description; Requirements; toggles "Published" and "Show closing date". Buttons: Save and publish, Save draft, Close job (danger). Closed jobs and jobs past their closing date leave the public page automatically.
- **Applications list**: status tabs for the stages (All, Received, Shortlisted, Interview, Checks, Offer, Hired); columns Applicant, Role, Experience, Stage, Rating (1 to 5 stars), Applied.
- **Applicant detail**: all answers, a **View CV** button (opens a 10-minute signed link), rating, notes, stage control. Stages: Received · Shortlisted · Interview · Reference and licence check · Offer · Hired · Declined (reason required).

### 7.6 Content manager

Tabs: Services, Team, FAQ, Testimonials, Areas, Pricing, Media. Every item has Published and order. Changes save as draft until published; an "Undo last change" button restores the previous version. A live preview opens the public page in a side panel. Every translatable field has **language tabs** (EN, then each enabled language) with a status dot (missing, draft, reviewed) and a “Copy English text” helper; see Section 17.

| Tab | Fields |
| --- | --- |
| Services | Service name; page address (slug); short summary; display order; photo (upload from Media); hero headline; hero lead; hero label; three facts; **Who this care is for** (one item per line); **What a visit includes** (one item per line); **Common questions** (Question \| Answer, one per line, or linked FAQs); related services (up to 3); search title (SEO); search description; Published. The services table also shows whether the photo is a photo or an icon tile. |
| Team | Name; role; qualification; registration number (admin only, never public); photo (3:4); short bio; Show on website; order. |
| FAQ | Question; answer; applies to (all services or one service); order; Published. |
| Testimonials | First name and area; quote; written permission received (required to approve); Approved. Only approved ones render. |
| Areas | Chips with add and remove; reorder by drag. |
| Pricing | Three cards: Free assessment, Your quote, Your care plan, each with tag, title, text, optional price line and "Show this card"; global switch "Show prices publicly" (off at launch: free assessment, then a quote). |
| Media | Grid of uploads (2 columns phone, 3 tablet, 5 desktop, square thumbs). Upload accepts JPG, PNG, WebP, SVG (≤2 MB), max 10 MB, auto-resized to 480, 800 and 1280px and converted to WebP, original kept. Each asset has alt text (required before it can be used) and a delete that is blocked while in use. |

### 7.7 Users and roles

List columns: Name, Email, Role, Last login, Status (Active, Invited). "+ Invite user" sends an email invite (valid 7 days). Owner can change roles, deactivate, reset password and force sign-out. A user cannot demote or deactivate the last Owner. A permissions matrix below the list shows:

| Can… | Owner | Manager | Coordinator | Editor |
| --- | --- | --- | --- | --- |
| Manage enquiries | ✓ | ✓ | ✓ | – |
| Manage careers and applicants | ✓ | ✓ | – | – |
| Edit website content | ✓ | ✓ | – | ✓ |
| Change site settings | ✓ | ✓ | – | – |
| Manage users | ✓ | – | – | – |
| Export data | ✓ | ✓ | – | – |

### 7.8 Site settings (the variables)

Tabs and keys. Every key is stored in the `settings` table (Section 8.3) and returned to the public site by `GET /api/v1/public/site`. Saving writes an audit entry and invalidates the public cache.

| Tab | Key | Controls |
| --- | --- | --- |
| Business | `business.name` | "Nest Home Care Uganda" |
| | `business.tagline` | "Trusted · Reliable · Compassionate" |
| | `business.phone_display` | "0787 499 988", shown everywhere |
| | `business.phone_dial` | "+256787499988", all `tel:` links |
| | `business.whatsapp` | digits only, "256787499988", all `wa.me` links |
| | `business.email` | contact email |
| | `business.address` | "Kampala, Uganda" |
| | `business.hours` | opening hours text |
| | `business.facebook`, `business.instagram` | footer icons (hidden when empty) |
| | `business.location_strip` | text under the hero |
| Homepage | `home.headline` | "Care that comes home to you." |
| | `home.accent` | "comes home" (must appear in the headline) |
| | `home.btn1`, `home.btn2` | hero button labels |
| | `home.lead` | hero lead |
| | `home.eggs` | three `{title, caption}` pairs |
| | `home.promise` | three `{title, text}` pairs |
| | `home.show_team`, `home.show_testimonials`, `home.show_sticky_bar` | toggles |
| Forms | `forms.who_options`, `forms.start_options` | dropdown values |
| | `forms.consent_text`, `forms.thanks_message`, `forms.whatsapp_prefix` | messages |
| | `forms.open_whatsapp_after`, `forms.save_enquiries`, `forms.require_phone` | switches |
| Notifications | `notify.enquiry_emails`, `notify.application_emails` | recipients |
| | `notify.sms_number`, `notify.reminder_minutes` (default 30) | SMS number, reminder delay |
| | `notify.email_new_enquiry`, `notify.sms_new_enquiry`, `notify.sms_confirm_visitor`, `notify.daily_summary` | switches |
| | `notify.hours_from`, `notify.hours_to` | reminder working hours (07:00 to 20:00) |
| Appearance | `theme.forest`, `theme.gold`, `theme.leaf`, `theme.mint` | brand colours (validated, see below) |
| | `theme.logo`, `theme.favicon` | media references |
| SEO | `seo.home_title`, `seo.home_description`, `seo.google_business_url`, `seo.index` | search text and the indexing switch (**`seo.index` is off** until the real domain is attached) |
| Languages | `site.default_language` | “en” |
| | `site.languages_enabled` | list of language codes shown in the switcher; only languages with reviewed content should be enabled |

**Colour changes** are injected as CSS variables in a `<style>` tag generated from the settings response. The server refuses a colour change that makes any of these pairs fall below WCAG AA 4.5:1: `--onf` on `--forest`; `#1B1706` on `--gold`; `--ink` on `--bg`. A "Reset to brand colours" button restores defaults.

### 7.9 Reports

Four stat cards: Enquiries this month, Reached assessment (%), Average first reply (minutes), Applications. Box "Export": Data (Enquiries, Applications, Activity log), From, To, **Download CSV** and **Download Excel**. Box "Most requested services": top four with percentage bars (gold fill on a `--bg` track, 8px). Exports respect the role matrix and write an audit entry.

### 7.10 Activity log

Read-only table: When, User, Action, Item. Examples: "Changed status to Contacted: Enquiry: James Okello", "Published job: Registered Nurse", "Changed phone number: Site settings". Filter by user and date. Retained for 24 months.

---

## 8. Data model (MongoDB)

### 8.1 Conventions

- One database, one collection per row below. Documents use `_id: ObjectId`; the API exposes it as a string `id`. Every document has `created_at` and `updated_at` (UTC). Content collections also have `deleted_at` (soft delete).
- **Embed** data that is read together and bounded (events inside an enquiry, notes inside an application). **Reference** by `ObjectId` for shared records (services, media, users). Never store the same editable text in two places; store references and resolve them in the service layer. A short name snapshot is allowed on enquiries so history stays readable after a service is renamed.
- **Localised text** (anything the public reads) is a `LocalizedText` object: `{ "en": "...", "lg": "..." }`. Rules in Section 17.2. Fields marked *L* below are localised.
- Enums are stored as lowercase strings and validated by Pydantic.
- Multi-document changes that must be atomic (create enquiry plus counter, publish content plus version) use a transaction; Atlas provides the required replica set.

### 8.2 Enums

| Enum | Values |
| --- | --- |
| `user_role` | owner, manager, coordinator, editor |
| `enquiry_status` | new, contacted, assessment_booked, care_started, not_proceeding, spam |
| `enquiry_source` | form, whatsapp_button, call_button, manual |
| `not_proceeding_reason` | price, no_capacity, outside_area, other |
| `application_stage` | received, shortlisted, interview, checks, offer, hired, declined |
| `job_type` | full_time, part_time, contract |
| `job_department` | clinical, care, admin |
| `translation_status` | missing, draft, reviewed |

### 8.3 Collections

| Collection | Fields |
| --- | --- |
| `users` | name, email (unique, lowercase), password_hash, role, is_active, totp_secret (encrypted, nullable), failed_logins, locked_until, last_login_at, preferred_language |
| `refresh_tokens` | user_id, token_hash, expires_at (**TTL index**), revoked_at, user_agent |
| `password_resets` | user_id, token_hash, expires_at (**TTL index**), used_at |
| `enquiries` | reference (unique, "NHC-000123", from `counters`), name, phone_raw, phone_e164, relationship, services: [{service_id, name_snapshot}], area, preferred_start, note, source, status (default new), not_proceeding_reason, assigned_to (user id or null), consent, consent_at, language (the visitor’s site language), ip_hash, user_agent, first_contacted_at, closed_at, **events**: [{at, user_id, kind (received, alert_sent, status_change, assignment, note), data, text}] |
| `jobs` | title *L*, department, location, type, description *L*, requirements *L*, closes_on, registration_required, published, show_closing, closed_at |
| `applications` | job_id (null = general interest), name, phone_e164, email, registration_number, qualification, experience_years, area, availability, cv_file_key, cv_file_name, cover_note, stage (default received), decline_reason, rating (1–5, null), consent, consent_at, ip_hash, delete_after (**TTL-style purge job**), **events**: [{at, user_id, kind, data, text}] |
| `services` | slug (unique), name *L*, summary *L*, number, hero_label *L*, hero_headline *L*, hero_lead *L*, facts *L* (3), who_for *L* (list), includes *L* (list), how_often *L*, photo_media_id, icon_key, related (up to 3 service ids), seo_title *L*, seo_description *L*, sort_order, published |
| `faqs` | question *L*, answer *L*, service_id (null = all), sort_order, published |
| `team_members` | name, role *L*, qualification *L*, registration_number (never public), bio *L*, photo_media_id, sort_order, published |
| `testimonials` | first_name, area, quote *L*, permission_received, approved |
| `areas` | name, sort_order (place names are not translated; optional `aliases`) |
| `pricing_blocks` | key (assessment, quote, plan), tag *L*, title *L*, text *L*, price_text *L*, show, sort_order |
| `articles` | slug (unique per language), title *L*, body *L* (markdown), image_media_id, published_at |
| `pages` | key (about_story, about_credentials, privacy, …), title *L*, body *L*, published |
| `media` | storage_key, public_url, variants: {480, 800, 1280}, alt_text *L*, mime, size_bytes, width, height, uploaded_by |
| `settings` | key (unique), value (any JSON, localised where marked), group |
| `translations_meta` | doc_type, doc_id, field, lang, status (translation_status), translator, reviewed_by, reviewed_at |
| `click_stats` | date (UTC day), channel (call, whatsapp), page, count (updated with `$inc` upserts; no personal data) |
| `notification_log` | channel (email, sms), to_hint (masked), template, status, error, related_type, related_id, at (**TTL 180 days**) |
| `audit_log` | at (**TTL 24 months**), user_id, action, item_type, item_id, item_label, before, after, ip_hash |
| `content_versions` | item_type, item_id, data, user_id, at (the last 10 per item are kept; powers “Undo last change”) |
| `counters` | _id (e.g. `enquiry_ref`), seq (incremented with `find_one_and_update` and `$inc`) |

### 8.4 Indexes

`enquiries`: `{status:1, created_at:-1}`, `{assigned_to:1}`, `{phone_e164:1}`, `{reference:1}` unique, a text index on name, phone_e164 and area. `applications`: `{job_id:1, stage:1}`, `{created_at:-1}`, `{delete_after:1}`. `services`: `{slug:1}` unique, `{sort_order:1}`. `faqs`: `{service_id:1, sort_order:1}`. `users`: `{email:1}` unique. `articles`: `{slug:1}`. `click_stats`: `{date:1, channel:1, page:1}` unique. `settings`: `{key:1}` unique. TTL indexes as marked. Indexes are created by the migration scripts, never at request time.

### 8.5 Migrations

`backend/migrations/` holds numbered scripts (`0001_indexes.py`, `0002_seed_defaults.py`, …) tracked in a `migrations` collection. They run on release and are idempotent. Schema evolution in MongoDB is additive: new fields get defaults in the Beanie model and are backfilled by a script.

---

## 9. Backend (FastAPI)

### 9.1 Conventions

- Base path `/api/v1`. JSON in and out (multipart only for applications and media). Dates are ISO 8601 UTC; times shown in `Africa/Kampala` in the UI.
- Pagination: `?page=1&page_size=25` returns `{items, total, page, page_size}`.
- Errors: `{error: {code, message, fields?: {name: message}}}`. Codes: `validation_error`, `unauthorised`, `forbidden`, `not_found`, `conflict`, `rate_limited`, `server_error`. Never return stack traces.
- Public endpoints are under `/public`; admin endpoints under `/admin` and require a bearer access token plus a role check through a `require_roles(...)` dependency.
- Language: public endpoints accept `?lang=xx` (or the `Accept-Language` header) and return resolved text for that language, falling back to English per field. Admin endpoints return the full `LocalizedText` objects plus `translation_status`. See Section 17.
- OpenAPI schema is the contract; the frontend types are generated from it (`openapi-typescript`).
- CORS: only the configured frontend origins; credentials allowed.
- Security headers on all responses; HTTPS only; cookies `HttpOnly; Secure; SameSite=Lax`; CSRF protection for cookie-authenticated refresh and logout via a double-submit token header.

### 9.2 Modules

```
backend/app/modules/
  auth/           login, refresh, logout, forgot/reset, TOTP
  users/          CRUD, invites, roles
  enquiries/      public create, admin list/detail/status/notes/export
  jobs/           admin CRUD, public list
  applications/   public create, admin list/detail/stage/notes, CV links
  services/       content CRUD + public read
  team/  faq/  testimonials/  areas/  pricing/  articles/  pages/
  languages/      enabled languages, translation status, missing-text report
  media/          upload, resize, list, delete
  settings/       grouped get/put, public aggregate, theme validation
  notifications/  email + SMS providers, templates, reminders, daily summary
  reports/        dashboard metrics, CSV and Excel export
  audit/          write and query audit log, content versions
  public/         aggregate endpoints for the website, click tracking, health
```

Each module has `router.py`, `schemas.py` (Pydantic), `models.py` (Beanie documents), `repository.py` (queries only), `service.py` (business rules, audit calls) and `tests/`. Routers contain no business logic.

### 9.3 Public endpoints (no auth)

| Method and path | Purpose |
| --- | --- |
| `GET /public/site?lang=` | All settings the site needs (business, home, forms, theme, seo) in the requested language. Cached 60 seconds with an `ETag`. |
| `GET /public/languages` | Enabled languages: code, name in its own language, direction (`ltr` or `rtl`). |
| `GET /public/services`, `GET /public/services/{slug}` | Published services; detail includes FAQs and related services. |
| `GET /public/team`, `/public/areas`, `/public/faqs`, `/public/testimonials`, `/public/pricing`, `/public/articles`, `/public/articles/{slug}` | Published content. |
| `GET /public/pages/{key}` | About story, credentials, privacy. |
| `GET /public/jobs`, `GET /public/jobs/{id}` | Published jobs not past their closing date. |
| `POST /public/enquiries` | Create enquiry. Body per 6.1. Returns `{reference, whatsapp_url}`. |
| `POST /public/applications` | Multipart application per 6.3. |
| `POST /public/clicks` | Record a call or WhatsApp click. |
| `GET /health` | Liveness and database check. |

### 9.4 Auth endpoints

`POST /auth/login`, `POST /auth/2fa/verify`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/forgot`, `POST /auth/reset`, `POST /auth/accept-invite`, `GET /auth/me`, `POST /auth/change-password`, `POST /auth/2fa/enable`, `POST /auth/2fa/disable`.

### 9.5 Admin endpoints

| Area | Endpoints (all under `/admin`) | Roles |
| --- | --- | --- |
| Dashboard | `GET /dashboard` | owner, manager, coordinator |
| Enquiries | `GET /enquiries`, `GET /enquiries/{id}`, `PATCH /enquiries/{id}` (status, assigned_to, reason), `POST /enquiries/{id}/notes`, `POST /enquiries` (manual entry), `GET /enquiries/export` | owner, manager, coordinator (export: owner, manager) |
| Jobs | `GET/POST /jobs`, `GET/PATCH/DELETE /jobs/{id}`, `POST /jobs/{id}/publish`, `POST /jobs/{id}/close` | owner, manager |
| Applications | `GET /applications`, `GET /applications/{id}`, `PATCH /applications/{id}` (stage, rating, decline_reason), `POST /applications/{id}/notes`, `GET /applications/{id}/cv` (signed URL), `DELETE /applications/{id}` (data deletion request), `GET /applications/export` | owner, manager |
| Content | `GET/POST /services`, `GET/PATCH/DELETE /services/{id}`; the same pattern for `/team`, `/faqs`, `/testimonials`, `/areas`, `/pricing`, `/articles`, `/pages`; `POST /content/{type}/{id}/undo`; `POST /content/{type}/reorder` | owner, manager, editor |
| Media | `GET /media`, `POST /media` (multipart), `PATCH /media/{id}` (alt text), `DELETE /media/{id}` | owner, manager, editor |
| Settings | `GET /settings`, `PUT /settings/{group}`, `POST /settings/theme/reset`, `GET /languages/report` (untranslated or unreviewed text), `PUT /translations/{type}/{id}/{field}/{lang}` | owner, manager (translations: also editor) |
| Users | `GET/POST /users`, `PATCH /users/{id}`, `POST /users/{id}/reset-password`, `POST /users/{id}/sign-out` | owner |
| Reports | `GET /reports/summary`, `GET /reports/export?type=&from=&to=&format=csv\|xlsx` | owner, manager |
| Activity | `GET /activity` | owner, manager |

Mongo note: list endpoints use indexed filters plus cursor-friendly sorting on `created_at`; avoid unbounded `$regex` (use the text index).

Filters on list endpoints: `q`, `status`, `service`, `area`, `assigned_to`, `from`, `to`, `sort`.

### 9.6 File handling

- CVs: accept PDF, DOC, DOCX; max 5 MB; verify magic bytes, not just extension; random storage key; stored in the private bucket; never served from a public URL; signed link valid 10 minutes; virus scan hook (ClamAV or provider) before the application is marked complete.
- Images: validate type and size, strip EXIF location data, generate WebP variants at 480, 800 and 1280px, keep the original privately.

### 9.7 Security and privacy

Argon2id password hashing; secrets only from environment variables; minimum data collected (no medical history in any form); IP stored only as a salted hash for rate-limit and abuse review; role checks in dependencies and re-checked in services; audit log for every admin write and every export; encrypted backups with a tested restore; applicant data deleted after `delete_after` (default 12 months) by a scheduled job; enquiry personal data anonymised after 24 months unless the enquiry became a client (confirm in Section 16); MongoDB Atlas network access limited to the backend, database user with least privilege, encryption at rest and TLS in transit, and backups enabled (check what the chosen Atlas tier includes). Not legal advice: a Ugandan lawyer reviews retention and any registration duties before launch.

### 9.8 Notifications

The owner monitors the alerts at launch, so the first recipient addresses and numbers are the owner’s; the client’s staff are added in admin Settings later.

| Trigger | Action |
| --- | --- |
| New enquiry | Email to `notify.enquiry_emails`; SMS to `notify.sms_number` if enabled; optional confirmation SMS to the visitor (off by default): “Thank you for contacting Nest Home Care. A nurse will call you shortly.” |
| Enquiry still New after `notify.reminder_minutes` during working hours | Reminder email and SMS, repeated every reminder interval up to 3 times |
| New application | Email to `notify.application_emails` |
| Daily summary (07:00) | Email: new enquiries, unanswered, applications waiting |
| Invite, password reset | Email |

**Provider interfaces.** `SmsProvider.send(to, text, sender_id) -> SendResult` and `EmailProvider.send(to, subject, html, text) -> SendResult`. Implementations: `MambaSmsProvider`, `LogOnlySmsProvider` (development), and an email provider chosen at deploy time. **The MambaSMS endpoint, authentication method and payload were not verified here; read their API documentation first and keep all of it inside `MambaSmsProvider`.** Environment: `MAMBASMS_API_URL`, `MAMBASMS_API_KEY`, `MAMBASMS_SENDER_ID`. Ugandan numbers are sent in the format the provider requires (normalised `+256…` is stored). Messages stay within one SMS segment where possible; avoid accented characters unless the provider supports Unicode. Failures are logged in `notification_log` and never fail the user’s request.

### 9.9 Configuration (environment)

`MONGODB_URI`, `MONGODB_DB`, `SECRET_KEY`, `ACCESS_TOKEN_MINUTES=15`, `REFRESH_TOKEN_DAYS=7`, `CORS_ORIGINS` (include the Vercel domain and any preview domains), `FRONTEND_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET_PUBLIC`, `S3_BUCKET_PRIVATE`, `S3_KEY`, `S3_SECRET`, email provider settings, `MAMBASMS_API_URL`, `MAMBASMS_API_KEY`, `MAMBASMS_SENDER_ID`, `TURNSTILE_SECRET` (optional), `IP_HASH_SALT`, `TZ=Africa/Kampala`, `PORT` (read from the platform), `SENTRY_DSN` (optional). Provide `.env.example` with no real values. The backend follows twelve-factor rules (config only from the environment, logs to stdout, stateless) so it runs the same on Render and Northflank.

---

## 10. Frontend (React) architecture

### 10.1 Data and state

- Server state: TanStack Query. Keys: `['site']`, `['services']`, `['service', slug]`, `['team']`, etc. Public queries use `staleTime: 60_000`.
- `useSiteSettings()` provides business, home, forms, theme. A `<ThemeStyle>` component writes admin colour overrides as CSS variables.
- Forms: React Hook Form with Zod resolvers; one shared schema per form in `lib/schemas`.
- Admin auth: access token in memory, refresh through the cookie; an Axios/fetch wrapper retries once after a 401 by refreshing.
- No global client state library. Local UI state only (menu open, tab selection).

### 10.2 Routing and layouts

`PublicLayout` wraps public routes (header, footer, sticky bar, scroll to top and focus the `<main>` on route change). `AdminLayout` wraps `/admin/*` behind `RequireAuth` and `RequireRole`. Unknown routes show the 404 page.

### 10.3 Rendering, SEO programme and performance

- **Stays React + Vite** because the owner’s SEO programme is built for it. The public routes are **pre-rendered to static HTML at build time** (for example `vite-plugin-ssg`, `vite-react-ssg` or a Playwright prerender step; use whichever the SEO programme expects) for every enabled language, so search engines and social previews see full content and meta tags without running JavaScript. The admin is never pre-rendered.
- Pre-render data comes from the public API at build time; a Vercel deploy hook (called by the backend when content is published) rebuilds the site. Until that hook exists, a scheduled rebuild (for example hourly) is acceptable. Client-side hydration then keeps pages live.
- Per-page meta through `react-helmet-async`: title, description, canonical, `hreflang` alternates, Open Graph and Twitter tags, JSON-LD (Section 11).
- Budget: first load under 150 KB JS (gzip) on the public home page; LCP under 2.5s on a throttled mid-range phone; CLS under 0.1. Self-host fonts and subset them to the languages enabled, preload the two fonts used above the fold, lazy-load below-the-fold images and the map. Images use `<picture>` and `srcset` with explicit dimensions.

### 10.4 Accessibility checklist

WCAG 2.2 AA. Landmarks `header`, `nav` (aria-label "Main"), `main`, `footer`; one H1 per page; visible focus; tap targets at least 44px (buttons 46px, chips 44px, inputs 48px); contrast as designed; labels on every field; errors with `role="alert"`; decorative SVGs `aria-hidden`; the egg group and the logo have accessible names; the Services dropdown is keyboard operable; reduced-motion respected; page language `en`.

### 10.5 Analytics

Privacy-respecting analytics (Plausible or similar). Goals: Call click, WhatsApp click, Enquiry sent, Application sent. Report monthly: enquiries by source, enquiries converted to visits, applications, top pages, share of phone visitors.

---

## 11. SEO

- One page per service with unique title and description, for example `Postnatal and Newborn Care at Home in Kampala | Nest Home Care`.
- `LocalBusiness` (or `MedicalBusiness`) JSON-LD with name, phone, address, hours, areas served, sameAs links; `FAQPage` JSON-LD on pages with accordions; `JobPosting` JSON-LD on job pages.
- `sitemap.xml` and `robots.txt` generated from published content; `seo.index` off adds `noindex`.
- **Multilingual SEO:** one URL per language (`/lg/services/...`), `hreflang` alternates (including `x-default` pointing to English), `<html lang dir>`, a canonical per language, and all language URLs in `sitemap.xml`. Only reviewed translations are indexed (Section 17.4).
- **Domain:** the canonical host comes from `VITE_SITE_URL`. While the site runs on the Vercel free domain it is **`noindex`** (admin setting `seo.index` off and a `X-Robots-Tag` header), so the temporary address never competes with the real domain. Switch it on when the real domain is attached.
- Clean URLs as in Section 5; canonical tags; descriptive image alt text; a Google Business Profile that matches the site exactly.

---

## 12. Content and seed data

### 12.1 Services (order fixed)

| # | Slug | Name | Summary | Photo |
| --- | --- | --- | --- | --- |
| 1 | `elderly-companion-care` | Elderly and companion care | Daily help, companionship, dignity | `service-0-elderly.jpg` |
| 2 | `postnatal-newborn-care` | Postnatal and newborn care | Mother and baby support at home | `service-1-postnatal.jpg` |
| 3 | `wound-care-medication` | Wound care and medication | Dressings, injections, vitals | `service-2-wound-care.jpg` |
| 4 | `physiotherapy-at-home` | Physiotherapy at home | Recovery, mobility, exercise | icon tile |
| 5 | `palliative-respite-care` | Palliative and respite care | Comfort and family relief | icon tile |
| 6 | `chronic-disease-management` | Chronic disease management | Diabetes and hypertension | `service-5-chronic.jpg` |
| 7 | `pediatric-home-nursing` | Pediatric home nursing | Nursing care for children | icon tile |
| 8 | `hospital-to-home` | Hospital to home transition | A smooth move from ward to home | icon tile |

### 12.2 Business defaults

Phone display `0787 499 988`; dial `+256787499988`; WhatsApp `256787499988`; office "Kampala, Uganda"; hours "Add opening hours" until supplied; email `info@nesthomecare.ug` (placeholder until the domain is confirmed).

### 12.3 Areas (default list, client to confirm)

Kampala Central, Kololo, Nakasero, Ntinda, Bugolobi, Muyenga, Kisaasi, Kawempe, Makindye, Entebbe Road, Mukono, Wakiso.

### 12.4 Jobs (sample)

Registered Nurse (Kampala, Full-time), Midwife (Kampala, Part-time), Caregiver and Companion (Kampala, Contract). Other roles to offer later: enrolled nurse, nursing assistant, physiotherapist, coordinator, driver.

### 12.5 Content the client must supply

Real nurse photos, names, roles, qualifications and registration numbers; business registration, licences, memberships; detail for each service (who for, what a visit includes, how often, 3 to 6 FAQs); pricing approach or assessment wording; full areas list and opening hours; 3 to 5 testimonials with written permission; common family questions; open roles and the hiring process; confirmation that WhatsApp is on 0787 499 988 and who monitors alerts; social links; the original service photos.

### 12.6 Tone

Plain, warm, reassuring; short sentences; no clinical jargon; name the benefit (dignity, rest, safety) before the service. Never promise cures, quote unconfirmed prices, or use phrases like "best in class". Calls to action are verbs plus an outcome: "Book a home visit", "Call now", "Chat on WhatsApp", "Send request".

---

## 13. Testing and acceptance

### 13.1 Definition of done per page

1. Matches the reference at 390, 820 and 1280px.
2. No horizontal scroll at any width from 320px to 1920px.
3. Lighthouse (mobile, throttled): Performance 90+, Accessibility 100, SEO 100.
4. Works with keyboard only; screen reader names are correct.
5. Both themes render correctly.
6. Content comes from the API, not hard-coded.

### 13.2 Critical flows (Playwright)

Submit a valid enquiry and see the thank-you with a working WhatsApp link; invalid phone shows an error; honeypot submission is rejected; rate limit returns the friendly message; enquiry appears in admin as New and an alert is sent; status change appears in the timeline; apply with a valid CV and an invalid file type; publish and close a job and see the public page update; change the phone number in settings and see every `tel:` and `wa.me` link update; change a brand colour and see a failing-contrast colour refused; sign in, lock out after 5 failures, role restrictions (editor cannot open Enquiries); export writes an audit entry.

### 13.3 Backend tests

Unit tests for phone normalisation, status transitions, role checks, theme contrast validation and retention jobs; integration tests for every endpoint with a test MongoDB; a migration-script test (runs twice without changes, indexes exist); tests for localisation fallback and for the hreflang and sitemap output.

---

## 14. Delivery plan

| Phase | Scope | Result |
| --- | --- | --- |
| 0 | Repo, CI, tokens, global CSS, UI kit, Logo, shapes | Design system in code |
| 1 | Public Home, Services, Service detail, About, Contact; public API; BookingForm with saved enquiries; deploy | Live site that captures enquiries |
| 2 | Auth, Dashboard, Enquiries, Settings, notifications | Every enquiry recorded, tracked, alerted |
| 3 | Team, How it works and pricing, Areas, FAQ, remaining services, Content manager, Media | Complete site |
| 4 | Careers, applications, hiring pipeline, Users, Reports, Activity log | Recruiting inside the admin |
| 5 | Articles, testimonials, pre-rendering, analytics review, Google Business Profile | Steady search traffic |

---

## 15. Deployment

- **Frontend on Vercel:** `VITE_API_URL`, `VITE_SITE_URL`; static output of the pre-render build; SPA fallback to `index.html` for `/admin/*`; security headers (`Content-Security-Policy` allowing self, the analytics host, the map tiles and the fonts host if not self-hosted). A Vercel **deploy hook** URL is stored as a backend secret for rebuilds on publish.
- **Review address:** the Vercel free domain (for example `nest-home-care.vercel.app`, name to be chosen) is used to show the client the application. It is `noindex` (Section 11), the backend `CORS_ORIGINS` includes it, and cookies use `SameSite=Lax` with the API on a separate origin, so confirm the cookie and CORS behaviour works across the two free domains before the client demo (if the browser blocks the cross-site refresh cookie, put the API behind a path on the same domain through a Vercel rewrite).
- **Backend on Render or Northflank:** build from `backend/Dockerfile` (the same image runs on both; no platform-specific code). Health check `/api/v1/health`, `PORT` from the environment, migrations run as a release or pre-deploy command. Free or low tiers may **sleep when idle**, which delays the first enquiry after a quiet period: use an always-on plan before launch, or a scheduled keep-alive ping while demoing. Check each platform’s current limits and pricing when choosing.
- **Database:** MongoDB Atlas, backend IP or private-network access only, database user per environment, backups on (confirm what the tier provides).
- **Storage:** S3-compatible buckets, public bucket behind a CDN domain, private bucket with signed URLs.
- **Environments:** development, staging (client review on the free domain), production. Seed script creates the 8 services, default settings, areas, FAQ, the three pricing blocks and the first Owner.
- **Domain and email:** the client is arranging these; when ready, attach the domain in Vercel, update `VITE_SITE_URL`, `FRONTEND_URL` and CORS, turn `seo.index` on, and set up SPF, DKIM and DMARC for the sending domain.

---

## 16. Open questions

Answered by the owner and now built into this version: MongoDB, React + Vite, English first with later languages, free assessment then quote, Vercel with Render or Northflank, MambaSMS, S3-compatible storage, the owner monitors alerts, and the Vercel free domain for review.

Still open (defaults in brackets):

1. **SEO programme:** what does it expect from the build (static pre-render, a sitemap format, specific meta or schema rules, a particular prerender tool)? [vite-react-ssg style pre-render, standard meta and JSON-LD]
2. **Languages:** which local languages first, and who will translate and review them? [Luganda, then Swahili, then Runyankole, Acholi and others you choose; reviewed by a nurse or professional translator]
3. **International languages:** which ones after the local ones (French, Arabic, Chinese, Portuguese)? Arabic needs right-to-left layout. [French and Arabic, later]
4. **Render or Northflank:** decide before the first deploy so only one pipeline is set up. [Render; Dockerfile keeps Northflank possible]
5. **MambaSMS:** who will send the API documentation, and should SMS go to the client’s staff, to the visitor, or both? [staff alerts only; visitor confirmation off]
6. **Alert contacts:** which email and phone number should receive alerts at launch? [yours, replaced by the client’s staff later]
7. **Retention:** keep applicant data 12 months and anonymise unconverted enquiries after 24 months? [Yes]
8. **Testimonials and blog:** at launch or phase 3? [Phase 3]
9. **WhatsApp:** click-to-chat links, or plan for the WhatsApp Business API later? [Click-to-chat]
10. **Content owner:** who maintains content day to day, and who is the first Owner account? [Client’s manager; you until handover]

---

## 17. Languages and localisation

The site launches in English. Everything is built so that adding a language is content work, not a rebuild. Local languages come first, then international ones.

### 17.1 Language registry

A `languages` setting lists each language: `code` (BCP 47), `name_native`, `name_en`, `dir` (`ltr` or `rtl`), `enabled`, `font_stack`. Suggested codes (the owner picks and orders them):

| Group | Languages | Codes |
| --- | --- | --- |
| Launch | English | `en` |
| Local, first | Luganda, Swahili | `lg`, `sw` |
| Local, next | Runyankole-Rukiga, Acholi, Lango, Ateso, Lusoga, Runyoro-Rutooro, Lugbara and others as chosen | `nyn`, `ach`, `laj`, `teo`, `xog`, `nyo`, `lgg` |
| International | French, Arabic (right-to-left), Portuguese, Chinese | `fr`, `ar`, `pt`, `zh` |

A language is only shown in the switcher when `enabled` is on and its coverage threshold is met (17.4).

### 17.2 How text is stored and resolved

- **Interface strings** (buttons, labels, form messages, validation text, footer headings) live in the frontend as `locales/{lang}/{namespace}.json` (namespaces: `common`, `home`, `services`, `forms`, `admin`, `errors`) and are loaded on demand with react-i18next. No visible English string is hard-coded in a component; every string has a key.
- **Content strings** (services, FAQs, team roles, settings text) are `LocalizedText` objects in MongoDB (Section 8). The API resolves them for the requested language, falling back to English **per field**, never per page, so a half-translated page still works.
- **Non-translated values:** names of people and places, phone numbers, dates and numbers are formatted with `Intl` using the active locale; they are not stored per language.
- **Keys and slugs:** URL slugs stay in English for every language at launch (`/lg/services/postnatal-newborn-care`) to keep one canonical structure. Localised slugs can be added later.

### 17.3 Routing and switching

- English lives at `/`; other languages are prefixed (`/lg/…`, `/sw/…`). The language switcher in the header shows the current code (a globe icon plus “EN”) and opens a list of native names; in the mobile menu it is a row at the bottom. It is **hidden while only one language is enabled**.
- First visit: use the browser’s language only to suggest a switch (a dismissible banner in that language), never to redirect automatically, so search engines and shared links stay predictable. The choice is remembered in `localStorage`.
- Forms record the language in which the visitor wrote (`language` on the enquiry) so staff can reply in kind. WhatsApp message text uses the active language’s `forms.whatsapp_prefix`.
- Every page sets `<html lang>` and `dir`; `hreflang` alternates link all language versions.

### 17.4 Translation quality for health content

- **No unreviewed machine translation is published.** Care instructions and nurse qualifications must be correct. Machine output may be used only as a first draft inside the admin.
- Each translated field has a status in `translations_meta`: **missing**, **draft**, **reviewed**. The public API serves a translation only when it is **reviewed**; otherwise it serves English.
- A language reaches the switcher only when at least **90% of the interface strings and all of the priority pages** (Home, Services, the service pages, Contact) are reviewed. The admin report (`GET /languages/report`) lists what is missing.
- The reviewer’s name and date are stored with the status.

### 17.5 Design requirements for translated text

- **Longer text:** Luganda, Swahili and French run 20 to 35% longer than English. Buttons, chips, ring text and egg captions must wrap or grow without breaking (use `min-height`, not fixed height; hero egg captions allow two lines; ring text allows up to four lines).
- **Fonts:** Fraunces, Figtree and Cormorant Garamond cover Latin and extended Latin, so Luganda, Swahili, Runyankole and French display correctly (subset with the needed diacritics). **Arabic and Chinese need their own font stacks** (for example Noto Naskh Arabic and Noto Sans SC) loaded only for those languages; the accent-italic style is not used for those scripts.
- **Right-to-left (Arabic):** build with CSS logical properties from the start (`margin-inline-start`, `padding-inline`, `inset-inline-end`, `text-align: start`) so a language can flip direction without a rewrite. Mirror directional elements (arrows, the step connector, breadcrumbs, the sticky bar order); keep the logo, phone numbers and the weave unmirrored.
- **Accent word rule:** each language chooses its own accent phrase inside the translated heading (`LocalizedText` for `home.accent`); one accent phrase per heading still applies.
- **SMS:** messages in other languages may need Unicode and split into more segments; keep them short.

### 17.6 Admin

Translatable fields show **language tabs** (Section 7.6). A “Translations” report page (under Content) shows coverage per language, per content type, with filters for missing and draft. The Owner and Manager can enable a language; Editors can translate and mark drafts; marking **reviewed** requires the Owner, Manager or a user with the Translator reviewer flag.

### 17.7 Acceptance

Switching language changes every visible string; a missing translation shows English without breaking the layout; `hreflang` and the sitemap list only enabled, reviewed languages; the layout passes at 320px with the longest translation; an RTL test language flips the layout correctly (use a pseudo-locale in CI).

---

## Appendix A: Admin interface summary per device

| Device | Navigation | Lists | Forms |
| --- | --- | --- | --- |
| Phone (<700px) | Bottom bar with five items; "More" for the rest | Cards | One column |
| Tablet (700–1039px) | 76px icon sidebar | Cards | Two columns where the field set is short |
| Desktop (≥1040px) | 244px labelled sidebar | Tables | Two columns; detail screens use a `1.4fr 1fr` split |

## Appendix B: Known differences between the original style guide and the reference HTML

The reference HTML (which the client reviewed last) wins. The developer should follow the reference.

| Item | Original style guide | Reference HTML (use this) |
| --- | --- | --- |
| Header height | 66px | 62px |
| Container side padding ≥700px | 36px | 34px |
| Section padding | 66px / 98px | 52px / 84px |
| Service card radius | 26px | 24px |
| Service icon | 46 × 56 arch with a number | 68 × 84 photo thumb or icon tile |
| Header nav | Services · How it works · Our team · Book | Services · About · How it works · Careers · Contact |
| Hero shapes | Egg, arch, egg | Three eggs |
| Hero trust list | Present | Moved to the "Our promise" rings |
| Booking | Single-page chips, WhatsApp only | Multi-page hybrid form; production uses chips (Section 4.16) |
| Rings | 190px | 180px |
| Step connector | Dotted gold line | Not in the preview; added in production (Section 4.11) |
| Hero entrance animation | Eggs rise in | Not in the preview; optional (Section 2.7) |

## Appendix C: Package contents

```
nest-home-care-design-package/
├─ README.md
├─ docs/
│  ├─ NEST_HOME_CARE_BUILD_SPEC.md              this document
│  ├─ Nest_Home_Care_Uganda_Website_Project_Master_Document.md
│  ├─ nest-home-care-design-system.md
│  └─ design-chat-transcript.md
├─ reference/
│  ├─ nest-home-care-complete.html              public site + admin in one file
│  ├─ nest-full-site-preview.html               public site only (original)
│  └─ nest-admin-preview.html                   admin only (original)
├─ design/
│  ├─ tokens.css                                Section 2 as CSS
│  └─ tokens.json                               Section 2 as JSON
└─ assets/images/                               four service photos from the flyer
```
