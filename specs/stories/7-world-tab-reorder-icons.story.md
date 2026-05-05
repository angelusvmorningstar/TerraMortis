---
id: issue-7
issue: 7
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/7
branch: morningstar-issue-7-world-tab-reorder-whowho
status: ready-for-dev
priority: medium
depends_on: []
---

# Story #7: World tab — reorder sections, BP/Humanity icons, unified row layout

As a player viewing the World tab,
I should see Court → Regencies → Who's Who in that order with blood potency and
humanity indicators on every row,
So that the most context-rich section appears last and I can assess political + social
weight at a glance without opening the sheet.

---

## Context

`public/js/tabs/city-tab.js` renders three collapsible sections. Currently: Court (minimal
one-liner rows) → Who's Who (full layout) → Regents (minimal). The desired order is
Court → Regencies → Who's Who, and Court and Regencies should adopt the same full row
layout as Who's Who, plus two new stat icon indicators for BP and Humanity.

Two icon assets already exist at:
- `public/assets/pdf/icons/bp-icon.png`
- `public/assets/pdf/icons/humanity-icon.png`

### Files in scope

- `public/js/tabs/city-tab.js` — all changes here; extract `charRow()`, `bpIcon()`,
  `humanityIcon()` as module-local helpers
- `public/css/suite.css` — add `.city-char-right`, `.city-stat-icon`, `.city-stat-glyph`
  after existing `.city-char-player` rule (~line 1309)

### Files NOT in scope

- Admin-side equivalents; PDF icon assets; court_category data model; map overlay

### Key constraints

- `redactPlayer` must continue to apply to all player names in all three sections
- Sort orders preserved: Court by CATEGORY_ORDER, Regencies alphabetical by territory,
  Who's Who per-covenant alphabetical
- Vacant regent territories render `(vacant)` with territory badge, no charRow
- Overlay glyphs via CSS only — no new image assets
- Mobile-first: `.city-char-right` must `flex-shrink: 0` so icons don't push off screen

### Icon logic

| Stat | Condition | Rendering |
|------|-----------|-----------|
| BP   | bp < 2    | plain icon |
| BP   | bp ≥ 2    | icon + `✕` overlay |
| Hum  | 4–7       | plain icon |
| Hum  | ≥ 8       | icon + `^` overlay |
| Hum  | < 4       | icon + `v` overlay |

---

## Acceptance Criteria

**Given** the World tab loads
**When** the sections render
**Then** order is Court → Regencies → Who's Who

**Given** a character with BP ≥ 2 appears in any section
**When** their row renders
**Then** the BP icon has a white `✕` glyph superimposed

**Given** a character with Humanity < 4 appears in any section
**When** their row renders
**Then** the Humanity icon has a white `v` glyph superimposed

**Given** a territory has no regent
**When** the Regencies section renders that territory
**Then** it shows `(vacant)` with the territory name as a badge

**Given** the World tab is viewed on mobile
**When** rows render
**Then** the stat icons and clan label remain visible without overflow
