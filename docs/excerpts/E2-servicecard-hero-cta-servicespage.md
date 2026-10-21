# Spec excerpt: service card, page hero, CTA band, services page (spec 4.9, 4.17, 4.18, 5.2)
### 4.9 Service card (`site/ServiceCard`)

`<Link>` styled as a card: `--surf` background, 1px `--line` border, radius 24px, padding 20px, gap 14px, text left-aligned, hover border `--gold`. Content: H3 name and a one-line summary.

- **Phone:** row layout. Thumb on the left: 68 × 84px, arch shape, 2px gold border, cover-fitted photo.
- **Tablet and up:** column layout. Thumb becomes full width, 190px tall (150px inside the 4-column desktop grid), radius 18px.
- **Without a photo:** the thumb is `--leaf` with a 34px (52px on tablet, 48px in the desktop grid) gold line icon (stroke `#E9C46A`, width 1.6, round caps). Icons: physiotherapy (figure), palliative (heart), pediatric (child head), hospital to home (house). Replace with a photo when `service.photo_id` is set; the admin Media library supplies it.
- Each card links to `/services/{slug}`.

### 4.17 Page hero (`site/PageHero`)

Forest background, `--onf` text. Breadcrumb ("Home / Services / …", links underlined, .82rem), Rule label, H1, lead. Variant `withPhoto` (service detail): at ≥700px two columns `1fr 320px` gap 40px, vertically centred; at ≥1040px `1fr 420px` gap 80px. Photo: arch, 2px gold border, `aspect-ratio: 3/4`, `box-shadow: 0 0 0 10px rgba(199,154,59,.16)` (the soft gold halo), width `min(260px, 72%)` on phone, 100% of its column from 700px; background `--moss` until loaded.

### 4.18 Call-to-action band (`site/CtaBand`)

Forest, centred, section padding. H2 (max 20ch, centred) and two buttons centred: primary **Book a home visit** (to `/contact`) and WhatsApp **WhatsApp us**. Appears at the end of every public page except Contact and Privacy. Heading text per page in Section 5.

### 5.2 Services overview (`/services`)

Page hero: Rule "Services", H1 "Eight kinds of care, one trusted team.", lead "Everything your family needs, delivered at home." Breadcrumb "Home / Services". Body: the 8 service cards, 1 / 2 / 4 columns. CTA band: "Not sure which care you need?"

