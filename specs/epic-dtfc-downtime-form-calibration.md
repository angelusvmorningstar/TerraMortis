# Epic: DTFC — Downtime Form Calibration

**Goal:** Redesign and calibrate the downtime submission form based on post-launch design review. Fix UX gaps, enforce mechanical correctness in feeding and XP spend, restructure project and sphere actions with smart targeting, and update the ST processing panel where response key formats change.

**Why:** The form was built incrementally across DTG, DTX, and earlier epics, optimising for correctness rather than player experience. A full design review (2026-04-20) identified 21 calibration tasks ranging from simple field removals to structural reworks. The CC analysis found two breaking changes to the ST processing panel (aspirations format, territory grid values) that must ship paired with their form changes.

**Source:** `specs/sprint-change-proposal-2026-04-20.md`

---

## Delivery Waves

### Wave 1 — Simple Calibrations (no ST panel changes)

| ID | Title | Status | Group |
|----|-------|--------|-------|
| dtfc.1 | Court section calibrations | done | A |
| dtfc.2 | Form section ordering | done | A |
| dtfc.3 | Project and sphere field calibrations | done | A |

### Wave 2 — Structure Changes (ship with ST panel updates)

| ID | Title | Status | Group |
|----|-------|--------|-------|
| dtfc.4 | Aspirations: structured slots | ready-for-dev | B |
| dtfc.5 | Territory grid: feeding rights model | ready-for-dev | B |
| dtfc.6 | Feeding: pool auto-load + vitae projection | ready-for-dev | B |
| dtfc.7 | Rote: project commitment UI | ready-for-dev | B |
| dtfc.8 | XP spend: structured dot purchase + admin carry-forward | ready-for-dev | B |

### Wave 1 — Addendum (post-review additions, no ST panel changes)

| ID | Title | Status | Group |
|----|-------|--------|-------|
| dtfc.12 | Remove Feed from project action dropdown | done | A |
| dtfc.13 | Merit section headers — Allies, Retainers clarity | done | A |
| dtfc.14 | Form buttons — centre layout + context-aware labels | done | A |

### Wave 3 — Deferred (blocked on new infrastructure)

| ID | Title | Status | Blocker |
|----|-------|--------|---------|
| dtfc.9 | NPC story moment | blocked | NPC data model doesn't exist |
| dtfc.10 | Collaborative projects | blocked | Invitation mechanism needs architectural design |
| dtfc.11 | Equipment tab in player.html | deferred | Scope TBD — remove from DT form is Wave 2; new tab is separate |

---

## Breaking Changes — ST Processing Panel

Wave 2 stories **dtfc.4** and **dtfc.5** change response key formats. The form change and the `downtime-views.js` update **must ship in the same commit** — splitting them will silently corrupt the ST processing display.

| Story | Form change | Panel impact | Lines in downtime-views.js |
|-------|------------|--------------|---------------------------|
| dtfc.4 | `aspirations` text → 3 structured keys | Display as 3 labelled lines instead of raw text | ~1014, ~2276, ~2279 |
| dtfc.5 | Territory value `'resident'` → `'feeding_rights'` | `feedTerrs[k] === 'resident'` check breaks; status loop breaks | ~1473, ~7925 |

---

## Key Files

| File | Role |
|------|------|
| `public/js/player/downtime-form.js` | Main form — all section rendering + response collection |
| `public/js/player/downtime-data.js` | `DOWNTIME_SECTIONS`, `DOWNTIME_GATES`, `SPHERE_ACTIONS`, `PROJECT_ACTIONS`, `FEED_METHODS` |
| `public/js/admin/downtime-views.js` | ST processing panel — reads response keys |
| `public/css/components.css` | Downtime form CSS |

---

## Response Key Changes Reference

| Old key | New key(s) | Story |
|---------|-----------|-------|
| `trust` | *(removed)* | dtfc.1 |
| `harm` | *(removed)* | dtfc.1 |
| `aspirations` (text) | `aspiration_1_type`, `aspiration_1_text`, `aspiration_2_type`, `aspiration_2_text`, `aspiration_3_type`, `aspiration_3_text` | dtfc.4 |
| `feeding_territories` value `'resident'` | `'feeding_rights'` | dtfc.5 |
| `_feed_rote` (bool only) | `_feed_rote` (bool) + `_feed_rote_slot` (1–4) | dtfc.7 |
| `project_N_xp` (free text) | `project_N_xp_category`, `project_N_xp_item`, `project_N_xp_dots` | dtfc.8 |
