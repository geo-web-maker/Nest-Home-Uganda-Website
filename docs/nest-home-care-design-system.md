# Nest Home Care Uganda: UI and Design System

**Version 1.0 · Reference build: `nest-home-care-final.html`**
Every value below is taken from the final design. If a value here and the HTML ever disagree, the HTML wins; update this document to match.

---

## 1. Brand and design concept

**Business:** Nest Home Care Uganda, compassionate home-based nursing in Kampala.
**Tagline:** "Trusted · Reliable · Compassionate · Home-based care for Ugandan families."
**Contact:** 0787 499 988 (tel link `+256787499988`) · Office: Kampala, Uganda.

**Concept: "the nest."** Soft egg and arch shapes sit on a woven nest edge. Forest green says medical trust, gold says warmth and care.

**Where each influence comes from**

| Influence | What it contributes |
|---|---|
| **Nest** (base) | Forest and gold palette, egg shapes, woven nest edge, dotted gold step connectors |
| **Fresh** | Mint section tint, arch shapes, white rounded cards, leaf-green accent |
| **Golden** | Thin gold lines, diamond markers, gold italic accent words, gold-ringed circles |

**Personality:** warm, calm, dignified, never cold or clinical. Speak to the family, not to a patient.

---

## 2. Colour

### 2.1 Light theme (default)

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#F3F8F1` | Page background |
| `--mint` | `#DFF0E6` | Services and team section background |
| `--surf` | `#FFFFFF` | Cards, form, icon surfaces |
| `--ink` | `#123524` | Body text and headings on light |
| `--mut` | `#4A6354` | Secondary text, descriptions |
| `--forest` | `#123524` | Header, hero, values band, booking band, footer |
| `--leaf` | `#1F8A5B` | Service icon arches |
| `--moss` | `#2F6B4A` | Selected chips, third hero shape, weave fill |
| `--gold` | `#C79A3B` | Primary buttons, accents, lines, step numbers, strip |
| `--straw` | `#E9DDB8` | First hero shape, photo placeholder stripes |
| `--line` | `#CBD8C6` | Card borders, input borders |
| `--onf` | `#F4F1DF` | Text on forest backgrounds |

**Fixed colours (do not change per theme)**

| Name | Hex | Use |
|---|---|---|
| WhatsApp green | `#25D366` | WhatsApp buttons (text `#06260F`) |
| Gold button text | `#1B1706` | Text on gold backgrounds |
| Straw shape text | `#2A2410` | Text on the straw hero shape |
| Gold hairline | `rgba(199,154,59,.4)` | Header bottom border, footer top border |
| Gold halo | `rgba(199,154,59,.35)` | Outer ring on values circles |

### 2.2 Dark theme
Applies with `prefers-color-scheme: dark`, or `data-theme="dark"` on `:root`. `data-theme="light"` forces light.

| Token | Hex |
|---|---|
| `--bg` | `#0C1A12` |
| `--mint` | `#12281D` |
| `--surf` | `#14271C` |
| `--ink` | `#E8EFE2` |
| `--mut` | `#9DB5A4` |
| `--line` | `#244233` |
| `--straw` | `#3A3620` |
| `--forest` | `#091410` |

`--leaf`, `--moss`, `--gold` and `--onf` stay the same in dark mode.

### 2.3 Colour rules
1. Gold is for action and emphasis only: buttons, one accent word per heading, lines. Never gold body text on white (fails contrast).
2. Text on forest is always `--onf`, never pure white.
3. Text on gold is always `#1B1706`.
4. WhatsApp green is used only for WhatsApp actions.
5. Section backgrounds alternate: dark (forest) → light → mint → dark so the page has rhythm.

---

## 3. Typography

### 3.1 Font families

| Role | Font | Weights | Fallback |
|---|---|---|---|
| Headings (`--serif`) | **Fraunces** (optical size 9..144) | 500, 700 (700 used) | Georgia, serif |
| Body and UI (`--sans`) | **Figtree** | 400, 500, 600 | system-ui, sans-serif |
| Accent words (`--script`) | **Cormorant Garamond** italic | 500, 600 (600 used) | Georgia, serif |

Loaded from Google Fonts with `display=swap`.

### 3.2 Type scale

| Element | Size | Weight | Line height | Notes |
|---|---|---|---|---|
| Body | `1.0625rem` (17px) | 400 | 1.6 | Figtree |
| Hero H1 | `clamp(2.5rem, 9.5vw, 4.7rem)` | 700 | 1.08 | Fraunces |
| Section H2 | `clamp(1.9rem, 5.4vw, 3.1rem)` | 700 | 1.08 | Fraunces, max width 20ch |
| Values H2 | `clamp(1.9rem, 5.4vw, 3rem)` | 700 | 1.08 | Centred |
| Hero lead | `1.15rem` | 400 | 1.6 | Max width 34ch, opacity .92 |
| Subtext (`.sub`) | `1.0625rem` | 400 | 1.6 | `--mut`, max width 52ch |
| Step title (H3) | `1.3rem` | 700 | 1.08 | Fraunces |
| Card title (H3) | `1.15rem` | 700 | 1.2 | Figtree |
| Card text | `.95rem` | 400 | 1.6 | `--mut` |
| Ring title | `1.5rem` | 700 | – | Fraunces |
| Ring text | `.9rem` | 400 | – | Opacity .85 |
| Hero shape title | `1.45rem` | 700 | – | Fraunces |
| Hero shape caption | `.88rem` | 600 | 1.25 | Figtree |
| Team name | `1.05rem` | 700 | – | Figtree |
| Team role | `.9rem` | 400 | – | `--mut` |
| Section label (`.rule`) | `.8rem` | 600 | – | Uppercase, letter spacing `.14em`, gold |
| Button | `1rem` | 600 | – | Figtree |
| Header button | `.92rem` | 600 | – | |
| Nav links | `.95rem` | 500 | – | Opacity .88, 1 on hover |
| Form hint | `.88rem` | 400 | – | `--mut` |
| Footer | `.93rem` | 400 | – | |
| Brand name | `1.1rem` | 700 | 1.05 | Fraunces |
| Brand sub-line | `.72rem` | 500 | – | Gold |

Letter spacing: headings `-0.01em`; accent words `0`.

### 3.3 The gold accent word
One phrase per heading is set in the gold italic accent style (`em.s`):
Cormorant Garamond, italic, weight 600, colour `--gold`.
Examples: *comes home*, *trusted*, *Ugandan families.*, *first visit.*, *at your door.*, *care.*
Rule: **never more than one accent phrase per heading.**

---

## 4. Layout and spacing

### 4.1 Container
- Max width **1180px**, centred.
- Side padding: **20px** on mobile, **36px** from 700px up.

### 4.2 Breakpoints

| Name | Range | Key changes |
|---|---|---|
| Mobile | under 700px | Single column, sticky call bar, nav hidden |
| Tablet | 700px and up | Nav shows, 2-column service grid, 3-up steps and rings, 4-up team |
| Desktop | 1040px and up | Split hero, 4-column services, split booking, sticky bar hidden |

### 4.3 Section spacing
- Section padding: **66px** top and bottom (mobile and tablet), **98px** (desktop).
- Hero: top padding **46px** (mobile), **76px** (desktop); no bottom padding (the weave sits flush).
- Gaps: hero columns 34px (mobile), 60px (desktop); card grid 14px; steps 28px (tablet+); team grid 16px.
- Grid top margin below the section intro: 34px (cards, team), 36px (steps, rings).

### 4.4 Safe areas
Root uses `padding-top/bottom: env(safe-area-inset-*)`. A fixed forest bar covers the top inset so the notch area is never blank. The sticky header sits at `top: env(safe-area-inset-top)`. Anchor scroll padding is the inset plus 70px.

---

## 5. Shapes

| Shape | CSS | Where |
|---|---|---|
| **Egg** | `border-radius: 50% 50% 50% 50% / 62% 62% 38% 38%` | Hero shapes 1 and 3, step numbers |
| **Arch** | `border-radius: 999px 999px 18px 18px` | Service icons, team photo frames, hero shape 2 (bottom corners softened to `50% / 30%`) |
| **Circle** | `border-radius: 50%` | Values rings |
| **Pill** | `border-radius: 999px` | Buttons, chips |
| **Soft card** | `26px` radius | Service cards |
| **Form card** | `32px` radius | Booking form |
| **Input** | `16px` radius | Text input |
| **Diamond** | 7px square, 1.5px gold border, rotated 45° | Section labels, hero trust list |

---

## 6. Logo
Inline SVG, `40 × 34` in the header.
- Gold cross: vertical line `20,1 → 20,7`, horizontal `17,4 → 23,4`, 2px stroke, round caps.
- Three eggs (ellipses): `#E9DDB8`, `#F4F1DF`, `#E9DDB8`, sizes about 10 × 13.
- Three woven nest arcs below, gold `#C79A3B`, 1.8px stroke, round caps.
- Beside it: "Nest Home Care" (Fraunces 700, 1.1rem) with "Uganda · Kampala" under it (Figtree 500, .72rem, gold).
- Keep clear space around the logo equal to the height of one egg. Never place it on gold.

---

## 7. Components

### 7.1 Buttons
| Variant | Background | Text | Border |
|---|---|---|---|
| Primary | `--gold` | `#1B1706` | 2px `--gold` |
| Outline (`.o`) | transparent | inherits | 2px currentColor |
| WhatsApp (`.wa`) | `#25D366` | `#06260F` | 2px `#25D366` |

Min height **48px**, padding `0 24px`, pill radius, font Figtree 600 1rem, gap 8px. Hover: `filter: brightness(1.07)`. Header button: min height 42px, padding `0 16px`, .92rem. Form button: full width. Focus ring: `3px solid --gold`, offset 3px.

### 7.2 Header
- Sticky, height **66px**, background `--forest`, text `--onf`, bottom border `1px rgba(199,154,59,.4)`, z-index 30.
- Left: logo and name. Centre (700px+): nav links **Services · How it works · Our team · Book**, gap 26px. Right: gold button "Call 0787 499 988" (`tel:+256787499988`).

### 7.3 Hero
- Background `--forest`, text `--onf`, overflow hidden.
- Left: section label "Compassionate home care", H1 "Care that *comes home* to you.", lead paragraph, two buttons (primary "Book a home visit" → `#book`; outline "Our services" → `#services`), then a trust list: **Trusted · Reliable · Compassionate** with diamond markers (.92rem, opacity .9, gap 8px 18px).
- Right: three shapes (**Elders**, **Newborns**, **Recovery**), absolutely positioned inside a box of height 340px (mobile), 400px (tablet, max width 520px), 470px (desktop, full column).

| Shape | Width | Height | Left/right | Top | Fill | Text | Form |
|---|---|---|---|---|---|---|---|
| 1 Elders | 32% | 68% | left 0 | 26% | `--straw` | `#2A2410` | Egg, rotated −7° |
| 2 Newborns | 36% | 84% | left 32% | 0 | `--gold` | `#1B1706` | Arch, bottom corners 50%/30%, on top |
| 3 Recovery | 32% | 64% | right 0 | 32% | `--moss` | `#FFFFFF` | Egg, rotated 8° |

Shape text sits at the bottom, centred, padding `0 10px 22px`.
- **Weave:** full-width SVG, 60px tall, `viewBox 0 0 1200 60`, a `--moss` wave plus two gold 2px curved lines.
- **Strip** under the hero: gold background, text "Home visits across Kampala and surrounding areas", centred, 600 weight, .98rem, padding 13px 20px.

### 7.4 Services section (`#services`, mint)
- Label "What we do", H2 "Eight kinds of care, one *trusted* team.", subtext.
- Grid: 1 column → 2 (700px+) → 4 (1040px+).
- **Card:** `--surf` background, 1px `--line` border, radius 26px, padding 22px, gap 16px. Mobile and tablet: icon left, text right. Desktop: icon above text.
- **Icon:** 46 × 56px arch, `--leaf` background, white number (Fraunces 700, 1.05rem), padding-top 8px.
- **Hover:** a 2px gold line grows from the left along the card bottom (inset 22px, `scaleX` 0 → 1, .35s).

**The eight services** (order fixed)
1. Elderly and companion care: Daily help, companionship and dignity.
2. Postnatal and newborn care: Mother and baby support at home.
3. Wound care and medication: Dressings, injections and vitals.
4. Physiotherapy at home: Recovery, mobility and exercise.
5. Palliative and respite care: Comfort for patients, relief for families.
6. Chronic disease management: Diabetes and hypertension.
7. Pediatric home nursing: Nursing care for children.
8. Hospital to home transition: A smooth move from ward to living room.

### 7.5 Values band ("Our promise", forest)
- Centred. Label, H2 "Home-based care for *Ugandan families.*"
- Three circles, **190 × 190px**, border 2px `--gold`, outer halo `outline: 1px rgba(199,154,59,.35)` with offset 7px, padding 18px, content centred.
  - **Trusted**: Qualified, ID-wearing nurses
  - **Reliable**: On time, every visit
  - **Compassionate**: Care with dignity
- Stacked on mobile (gap 22px), three across from 700px.

### 7.6 How it works (`#how`)
- Label, H2 "From first call to *first visit.*"
- Step number: 56 × 68px egg, gold, number in Fraunces 700 1.4rem, text `#1B1706`.
- Connector: 3px dotted gold line. Vertical on mobile (left 27px). Horizontal on tablet and up, running from the number to the next column.

| Step | Title | Text |
|---|---|---|
| 1 | Call or WhatsApp us | Tell us who needs care and what is happening. No jargon, no pressure. |
| 2 | We agree a care plan | A nurse listens to the family and sets out what care is needed, how often and when. |
| 3 | Care begins at home | Your nurse arrives in uniform with ID and gets to work in the comfort of your home. |

### 7.7 Team (`#team`, mint)
- Label "Our team", H2 "Faces you can trust *at your door.*"
- Grid: 2 columns mobile, 4 columns from 700px, gap 16px. Centre-aligned.
- **Photo frame:** arch shape, aspect ratio **3 / 4**, 2px gold border, margin-bottom 12px.
- **Placeholder (until real photos):** diagonal straw stripes (`repeating-linear-gradient(135deg, straw 0 8px, transparent 8px 16px)`) on `--surf` with the word "Photo".
- **Photo guidance:** upload real portraits, crop 3:4, face centred in the upper two-thirds, green scrubs, plain or natural background. Alt text: "Name, role".

### 7.8 Booking (`#book`, forest)
- Desktop: two columns (text left, form right), gap 72px. Mobile: stacked.
- **Form card:** `--surf`, radius 32px, padding 26px 22px, border 1px `--gold`.
- **Name input:** min height 50px, border 2px `--line`, radius 16px, padding `0 14px`, background `--bg`, margin-bottom 18px. Label: 600 weight.
- **Care chips:** all eight service names, wrapped, gap 8px. Min height 44px, padding `0 14px`, pill, border 2px `--line`, background `--bg`, .95rem 500. Selected (`aria-pressed="true"`): `--moss` background and border, white text.
- **Submit:** WhatsApp green button, full width, "Send on WhatsApp".
- **Hint:** "Opens WhatsApp with your message ready to send." (.88rem, centred).
- **Message built:** `Hello Nest Home Care, my name is {name}. I need: {services}.` If nothing is chosen: `Hello Nest Home Care, I would like to ask about home care.`
- **Link format:** `https://wa.me/256787499988?text={URL-encoded message}`

### 7.9 Footer
Forest background, top border `1px rgba(199,154,59,.4)`, padding 28px 0 32px, centred, .93rem.
Lines: **Nest Home Care Uganda** (bold) · "Trusted · Reliable · Compassionate · Home-based care for Ugandan families" · "Office: Kampala, Uganda · 0787 499 988".

### 7.10 Sticky action bar (mobile and tablet only)
- Fixed, left and right 12px, bottom `12px + safe area`, z-index 35, gap 10px.
- Two equal buttons: **Call now** (gold, `tel:+256787499988`) and **WhatsApp** (green, `https://wa.me/256787499988`). Shadow `0 6px 18px rgba(0,0,0,.3)`.
- Hidden from 1040px up. The page adds 84px bottom padding so the bar never covers content.

---

## 8. Motion
- Hero shapes rise in on load: `translateY(40px)` and fade to rest, **0.9s**, `cubic-bezier(.2,.8,.2,1)`, delays **0s, 0.12s, 0.24s**.
- Card hover underline: 0.35s.
- Button hover: brightness only.
- Smooth scrolling for anchor links.
- All animation is switched off under `prefers-reduced-motion: reduce`.
- No parallax, carousels or auto-playing media.

---

## 9. Accessibility
- All text meets WCAG AA contrast against its background (gold only as text on forest, never on white).
- Tap targets at least 44px (buttons 48px, chips 44px, inputs 50px).
- Visible focus ring on every interactive element: 3px gold, 3px offset.
- Semantic landmarks: `header`, `nav` (labelled "Main"), `main`, `section`, `footer`.
- Heading order: one H1, H2 per section, H3 for items.
- Hero art has `role="img"` with a text description. Decorative SVGs are `aria-hidden`.
- Chips use `aria-pressed`. Form inputs have visible labels.
- Page language `en`.

---

## 10. Content and tone

**Voice:** plain, warm, reassuring. Short sentences. No medical jargon on the surface; explain terms if used.
**Always:** name the benefit (dignity, rest, safety) before the service.
**Never:** promise cures, quote prices without confirmation, or use stock-sounding phrases ("best in class", "state of the art").
**Calls to action:** "Book a home visit", "Call now", "Send on WhatsApp". Keep them verbs plus a place or outcome.
**Punctuation:** use typographic apostrophes and quotation marks (’ “ ”) in visible text.

**SEO basics**
- Title: `Nest Home Care Uganda | Compassionate Home Care in Kampala`
- Description: `Trained nurses for elderly care, newborn care, wound care and more, at home across Kampala. Call 0787 499 988.`
- Favicon: 🪺

---

## 11. Imagery guidelines
- Real photos of the team in **green scrubs** with the gold crest, warm natural light.
- Care scenes at home (blood pressure check, mother and newborn, wound dressing), shot at the patient's eye level.
- Faces visible and smiling; avoid stock images of non-Ugandan families.
- Frame photos in the arch (portraits) or egg (decorative) shapes, with a 2px gold border for team photos.
- Keep every image under 200 KB (WebP or optimised JPG), with alt text.

---

## 12. Do and don't

| Do | Don't |
|---|---|
| Use one gold accent phrase per heading | Highlight several words in one heading |
| Keep forest and mint sections alternating | Put two dark sections back to back |
| Use arches for people, eggs for decoration | Mix square corners with the shapes |
| Put call and WhatsApp within one tap everywhere | Hide the phone number below the fold |
| Keep copy short and human | Write long clinical paragraphs |
| Test on a real phone with slow data | Add heavy videos or large images |

---

## 13. Technical notes
- **Single file:** one self-contained HTML file, CSS and JS inline. External: Google Fonts only.
- **No frameworks.** Vanilla JS builds the service cards and chips from one array and updates the WhatsApp link.
- **Hosting:** upload `index.html` to any static host (Netlify, GitHub Pages, cPanel). No server code required.
- **Editing services:** change the `S` array in the script; cards and booking chips update together.
- **Changing the number:** replace `0787 499 988` visibly and `256787499988` in every `tel:` and `wa.me` link (header, sticky bar, script).
- **Browser support:** current Chrome, Safari, Firefox, Edge. Falls back gracefully if fonts fail to load.

---

## 14. Quick-start CSS tokens

```css
:root{
  --bg:#F3F8F1; --mint:#DFF0E6; --surf:#FFFFFF;
  --ink:#123524; --mut:#4A6354; --forest:#123524;
  --leaf:#1F8A5B; --moss:#2F6B4A; --gold:#C79A3B;
  --straw:#E9DDB8; --line:#CBD8C6; --onf:#F4F1DF;
  --serif:"Fraunces",Georgia,serif;
  --sans:"Figtree",system-ui,sans-serif;
  --script:"Cormorant Garamond",Georgia,serif;
  --egg:50% 50% 50% 50%/62% 62% 38% 38%;
  --arch:999px 999px 18px 18px;
}
```

---

## 15. Page structure at a glance

| # | Section | Background | Anchor |
|---|---|---|---|
| 1 | Header (sticky) | Forest | – |
| 2 | Hero + weave | Forest | `#top` |
| 3 | Location strip | Gold | – |
| 4 | Services | Mint | `#services` |
| 5 | Our promise | Forest | – |
| 6 | How it works | Page | `#how` |
| 7 | Team | Mint | `#team` |
| 8 | Booking | Forest | `#book` |
| 9 | Footer | Forest | – |
| 10 | Sticky call bar (below 1040px) | Gold + green | – |
