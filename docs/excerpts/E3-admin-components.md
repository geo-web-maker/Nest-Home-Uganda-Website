# Spec excerpt: admin components (spec 4.19)
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

