# Spec excerpt: header, footer, sticky bar, responsive table (spec 4.3 to 4.6)
### 4.3 Header (`site/Header`)

- Sticky, top 0 (plus `env(safe-area-inset-top)`), z-index 9, background `--forest`, text `--onf`, bottom border `1px rgba(199,154,59,.4)`. Inner container height 62px, space-between.
- Left: `<Logo />` and name, clickable to `/`.
- Centre (≥700px): nav **Services · About · How it works · Careers · Contact**, gap 22px, `<nav aria-label="Main">`. Hover: text turns gold, opacity 1. The Services item opens a dropdown listing the 8 services at ≥1040px (hover and keyboard focus; never hover-only, it must also open on click).
- Right: gold button **Call** (`tel:` dial from settings). At ≥700px the label may read "Call 0787 499 988" if the width allows; below 700px it reads "Call".
- Below 700px: a 44 × 40px menu button (border 2px gold, radius 12px, gold ☰) toggles a panel: forest background, top border `1px rgba(199,154,59,.3)`, padding `6px 20px 14px`, full-width rows 46px high. The panel closes on route change and on Escape.

### 4.4 Footer (`site/Footer`)

Forest, top border `1px rgba(199,154,59,.4)`, padding `34px 0 24px`, .92rem. Three columns at ≥700px (one on phone), gap 22px:

1. **Well Nest Home Care**: "Trusted · Reliable · Compassionate. Office: Kampala · {phone}".
2. **Explore**: Services, Our team, Areas we serve, FAQ and care tips.
3. **Company**: About us, Careers, Contact, Privacy and terms.

Links are buttons or anchors, padding 5px 0, opacity .85. Bottom line centred: "© Well Nest Home Care Uganda", .84rem, opacity .7, margin-top 22px. Social icons render only if URLs are set in settings.

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

