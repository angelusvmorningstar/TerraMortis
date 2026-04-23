---
id: dtu.1
epic: dt-ux
status: ready-for-dev
priority: high
depends_on: []
---

# Story DTU-1: Fix Unreadable Button Text (Dark-Red-on-Red)

As a player,
I want button text to be readable on every button I see,
So that I'm not second-guessing which button does what.

---

## Context

The Submit Downtime button (and at least one other on the DT form) renders with dark-red text on dark-red background — effectively invisible. User flagged with screenshot showing the bug.

Likely cause: the button's `color` is inheriting `var(--crim)` from a parent rule rather than being explicitly set to `var(--txt-on-dark)`. The Tier 2 CSS token audit normalised `#fff` → `var(--txt-on-dark)` but missed buttons whose color wasn't set explicitly (rely on inheritance).

---

## Acceptance Criteria

**Given** a player views any DT form button with a crimson background
**When** it renders (both themes)
**Then** the text is cream (`var(--txt-on-dark)`), not dark red

**Given** an ST or coordinator views any other button with a crimson/accent background across the game app and admin app
**When** it renders
**Then** text is cream, not dark red

**Given** the site loads in either theme
**When** all `[class*="btn"]` elements are inspected
**Then** none have computed `color` equal to their `background-color`

---

## Implementation Notes

- Audit every rule with `background: var(--crim)` / `var(--accent)` / `var(--crim2)` in `public/css/*.css`. Confirm each sets `color: var(--txt-on-dark)` explicitly.
- Most probable offender: `.qf-btn-submit` in the DT form's shared questionnaire CSS. Inherited `color: var(--crim)` from `.reading-pane` or similar parent.
- Fix can be specific per-button rules OR a catch-all: `.btn-primary, .qf-btn-submit, .fin-btn { color: var(--txt-on-dark); }` if a shared ancestor is setting the offending color.
- Screenshot reference: Submit Downtime button.
- Regression test: Playwright test that captures computed style of Submit button and asserts `color !== background-color`.

---

## Files Expected to Change

- `public/css/components.css` (most likely)
- Possibly `public/css/suite.css` or `public/css/admin-layout.css`
- `tests/dt-button-contrast.spec.js` (new)
