# Story feature.79: CSS Token Pass (E1)

## Status: ready-for-dev

## Story

**As a** developer maintaining the DT Processing tab,
**I want** all ad-hoc inline styles and one-off CSS class names replaced with design tokens,
**so that** the tab has a consistent visual language and future changes can be made in one place.

## Background

The DT Processing tab was built across multiple epics. Each addition introduced its own CSS rules — some in `admin-layout.css`, some as inline `style="..."` attributes in JS strings. This story audits and standardises, making no functional changes.

This is the final story in the epic and should run after all other tracks are stable.

---

## Acceptance Criteria

1. All inline `style="..."` attributes in `downtime-views.js` processing-tab code are removed or replaced with CSS classes, except for:
   - Dynamic values that must be computed at render time (e.g. `display:none` toggled by state — these may remain as inline style only when no alternative exists)
2. All one-off CSS class names in `admin-layout.css` that duplicate an existing class's purpose are consolidated.
3. Design tokens (`--gold2`, `--crim`, `--bg`, `--surf*`, `--text*`) are used consistently — no hardcoded hex colours in processing-tab CSS.
4. No visual changes — the tab looks identical before and after.
5. No functional changes — all interactions, saves, and renders work identically.

---

## Tasks / Subtasks

- [ ] Task 1: Audit inline styles in `downtime-views.js` (processing section)
  - [ ] Grep for `style="` in the processing-tab code (~line 1790 onwards)
  - [ ] For each: determine if it can be replaced with a CSS class
  - [ ] Move to `admin-layout.css` with an appropriate class name

- [ ] Task 2: Audit hardcoded colours in processing-tab CSS
  - [ ] Grep `admin-layout.css` for hex values (#) in processing-tab sections (`.proc-*`, `.dt-chk-*`, `.dt-story-*`)
  - [ ] Replace with CSS custom properties where the token already exists

- [ ] Task 3: Consolidate duplicate class names
  - [ ] Identify classes with identical or near-identical declarations
  - [ ] Merge, keeping the more semantically named class

- [ ] Task 4: Manual verification
  - [ ] Visual diff: open DT Processing before and after — confirm no changes
  - [ ] Check all four action panel types render correctly
  - [ ] Check submission checklist, ambience dashboard, phase ribbon

---

## Dev Notes

### What counts as a legitimate inline style

Only these patterns are acceptable as inline styles:
- `style="display:none"` — toggled dynamically by JS (hidden/shown by event handlers)
- Truly dynamic values computed at render time that cannot be expressed as a class

Everything else should be a CSS class.

### Token reference

```css
--gold2: #E0C47A
--crim:  #8B0000
--bg:    #0D0B09
--surf1 / --surf2 / --surf3  (surface tiers)
--text / --text-muted
```

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Remove/replace inline styles with class names |
| `public/css/admin-layout.css` | Add classes; replace hex colours with tokens; consolidate duplicates |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Bob (bmad-agent-sm) |
