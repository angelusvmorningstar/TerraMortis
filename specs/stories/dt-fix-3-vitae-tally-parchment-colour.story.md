# Story DT-Fix-3: Vitae Tally — Positive Numbers Wrong Colour on Parchment

## Status: ready-for-dev

## Story

**As an** ST using the parchment (light) theme,
**I want** the positive vitae tally numbers to use a readable colour appropriate for a light background,
**so that** the tally is legible without eye strain and consistent with the rest of the parchment theme.

## Background

Positive values in the Vitae Tally section (Herd, Oath of Fealty, Ambience, etc.) use `.proc-mod-pos`, which applies `color: #5dbb6a` in dark theme. For the parchment theme the override uses `var(--green3)`. This is being reported as visually wrong — likely too bright / wrong tone against the parchment background.

Check all sidebar panels for the same issue (other sections may also use `.proc-mod-pos` or a similar positive-colour class).

---

## Current CSS

**File:** `public/css/admin-layout.css`

```css
/* Dark theme (line ~5098) */
.proc-mod-pos { color: #5dbb6a; }

/* Parchment override (line ~5726) */
html:not([data-theme="dark"]) .proc-mod-pos { color: var(--green3); }
```

**Applied to:** all positive modifier rows in the vitae tally panel — Herd, Oath of Fealty, Ambience, and any positive manual modifier.

---

## Required Change

1. Open the admin app in parchment theme and inspect the vitae tally section.
2. Identify which green token looks wrong and which looks correct against the parchment surface.
3. Check `--green1`, `--green2`, `--green3`, `--green4` CSS vars on `:root` for the parchment theme — pick the one with sufficient contrast against `--bg` (parchment surface colour).
4. Update the parchment override:

```css
html:not([data-theme="dark"]) .proc-mod-pos { color: var(--greenX); }
/* where X is the correct tier */
```

5. Also audit other panels (action sidebars, project panels) for any other classes using hardcoded `#5dbb6a` or a green token that looks wrong on parchment. Fix with the same token.

---

## Acceptance Criteria

1. Positive vitae tally numbers are clearly readable on the parchment theme background.
2. Colour passes basic contrast check (visible against `--surf2` or `--bg` parchment surface).
3. Dark theme appearance is unchanged.
4. No other panels in DT Processing have visually broken green numbers on parchment.

---

## Tasks / Subtasks

- [ ] Task 1: Reproduce the bug — open admin in parchment theme, navigate to DT Processing with an active cycle
- [ ] Task 2: Inspect which green token is used vs. which looks correct
- [ ] Task 3: Update `html:not([data-theme="dark"]) .proc-mod-pos` in `admin-layout.css`
- [ ] Task 4: Audit other sidebar/panel sections for same issue; fix any found
- [ ] Task 5: Verify both themes render correctly

---

## Dev Notes

### Theme toggle

Admin theme is toggled via `data-theme` attribute on `<html>`. Parchment = `data-theme` absent or set to `"parchment"` (check the actual toggle logic in admin.js).

### Key files

| File | Action |
|------|--------|
| `public/css/admin-layout.css` | Update `.proc-mod-pos` parchment override |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_

### File List
- `public/css/admin-layout.css`
