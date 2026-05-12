---
id: dt-form.19
task: 19
issue: 77
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/77
branch: morningstar-issue-77-influence-breakdown-tooltip
epic: epic-dt-form-mvp-redesign
status: review
priority: medium
depends_on: ['dt-form.17']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (Implementation Plan)
---

# Story dt-form.19 — City Influence breakdown tooltip

As a player or ST seeing the City Influence label (e.g. `8 / 10 Influence remaining`),
I should be able to hover and see how that figure is derived (which merits, which adjustments contribute),
So that the figure is auditable inline without leaving the form.

## Context

The `X / Y Influence remaining` label in the City section's influence grid is currently a flat number. `influenceBreakdown(c)` in `public/js/editor/domain.js` already exists as the source-of-truth breakdown — just consume it. The codebase tooltip pattern is native HTML `title=` attributes; the `.dt-xp-deficit[title]` CSS rule (components.css:5104–5108) is the exact precedent to mirror.

## Files in Scope

- `public/js/tabs/downtime-form.js` — two changes (import + label render)
- `public/css/components.css` — one new CSS rule for the influence budget label

## Files NOT in Scope

- `public/js/editor/domain.js` — `influenceBreakdown(c)` is already correct; read-only
- Any other influence display site (admin sheet, suite) — out of scope per ADR-003

## Acceptance Criteria

**Given** the City section renders the `X / Y Influence remaining` label
**When** the player hovers over it
**Then** a native browser tooltip appears listing each non-zero influence source (e.g. "Clan Status: 2\nAllies (The Academy): 1\nContacts: 1")

**Given** the tooltip is keyboard-accessible
**When** the label element receives focus
**Then** the `title` attribute is exposed to assistive technology via native browser behaviour

**Given** an existing tooltip pattern (`.dt-xp-deficit[title]`) exists
**When** this tooltip ships
**Then** the influence budget label uses the same `cursor: help` + dotted underline pattern (gold accent, not crimson, since it is informational not an error state)

## Implementation Notes

### Change 1 — Import `influenceBreakdown` (downtime-form.js line 20)

`influenceBreakdown` is NOT currently imported. Add it to the existing domain.js import line:

```javascript
// BEFORE (line 20)
import { calcTotalInfluence, domMeritTotal, attacheBonusDots, effectiveInvictusStatus, ssjHerdBonus, flockHerdBonus, meritEffectiveRating } from '../editor/domain.js';

// AFTER
import { calcTotalInfluence, domMeritTotal, attacheBonusDots, effectiveInvictusStatus, ssjHerdBonus, flockHerdBonus, meritEffectiveRating, influenceBreakdown } from '../editor/domain.js';
```

### Change 2 — Wrap the budget text in a titled span (downtime-form.js lines 6899–6903)

Current code:
```javascript
h += `<div class="dt-influence-budget" id="dt-influence-budget">`;
h += `<span class="dt-influence-remaining${remaining < 0 ? ' dt-influence-over' : ''}">${remaining}</span>`;
h += ` / ${budget} Influence remaining`;
h += '</div>';
```

Replace with:
```javascript
const infBreakdown = influenceBreakdown(currentChar);
const infTitle = infBreakdown.length
  ? infBreakdown.join('\n')
  : 'No influence sources';
h += `<div class="dt-influence-budget" id="dt-influence-budget">`;
h += `<span class="dt-influence-remaining${remaining < 0 ? ' dt-influence-over' : ''}">${remaining}</span>`;
h += ` / `;
h += `<span class="dt-influence-budget-label" title="${esc(infTitle)}">${budget} Influence remaining</span>`;
h += '</div>';
```

Key points:
- `currentChar` is in scope here — `getInfluenceBudget()` calls `calcTotalInfluence(currentChar)` just 2 lines above
- `esc()` is the form's existing HTML-escape helper — already used throughout this file
- `influenceBreakdown(c)` returns an array of strings; join with `\n` for native multiline tooltip
- Fallback to `'No influence sources'` for characters with zero influence (no blank tooltip)
- Wrap only the `budget` and "Influence remaining" text, not the `remaining` span (which is the coloured number — wrapping the whole div would be confusing)

### Change 3 — CSS rule (components.css, after line 5108)

Add immediately after the `.dt-xp-deficit[title]` block:

```css
/* dt-form.19: influence budget label tooltip — informational, gold accent */
.dt-influence-budget-label[title] {
  cursor: help;
  text-decoration: underline dotted var(--gold2, #E0C47A);
  text-underline-offset: 2px;
}
```

Uses `--gold2` (#E0C47A) instead of `--crim` since this is informational (not an error). Mirrors the same `cursor: help` + dotted underline pattern.

### What influenceBreakdown returns

```javascript
// Example output for a character with Clan Status 2, Allies, Contacts:
["Clan Status: 2", "Covenant Status: 1", "Allies (The Academy): 1", "Contacts: 2 (HWV)"]
// → title="Clan Status: 2\nCovenant Status: 1\nAllies (The Academy): 1\nContacts: 2 (HWV)"
```

Only non-zero sources are included. HWV (Honey With Vinegar) bonus is noted inline.

### What NOT to change

- The `.dt-influence-remaining` span — coloured red on negative, leave as-is
- The `getInfluenceBudget()` call — no change
- The influence grid rows below — no change
- The existing `.dt-xp-deficit[title]` CSS rule — leave untouched

## Test Plan

- Static review: import line includes `influenceBreakdown`; lines 6899–6903 show the new span with `title`; CSS rule present
- Browser smoke:
  1. Open form as any character with influence merits (ADVANCED mode, City section). Hover the "X / Y Influence remaining" text — confirm tooltip lists sources. Tab to the element — confirm tooltip is keyboard-reachable.
  2. Open form as a character with zero influence (no merits). Hover — confirm tooltip shows "No influence sources" rather than being blank.
  3. Confirm visual: dotted gold underline on "N Influence remaining" text, cursor changes to `help`.

## Definition of Done

- [x] `influenceBreakdown` added to import on line 20
- [x] `dt-influence-budget-label` span with `title` attribute wraps budget text at lines 6899–6903
- [x] CSS rule `.dt-influence-budget-label[title]` added to components.css with gold dotted underline
- [x] Smoke test: tooltip shows breakdown on hover for influence character
- [x] Smoke test: "No influence sources" shown for zero-influence character
- [x] Smoke test: keyboard accessible (tab to element, title exposed)
- [x] No regressions on influence grid stepper behaviour
- [ ] PR opened into `dev`

## Dev Agent Record

**Agent:** Claude Sonnet 4.6 (James)
**Date:** 2026-05-07

### File List

**Modified**
- `public/js/tabs/downtime-form.js`
- `public/css/components.css`

### Completion Notes

Three changes: (1) added `influenceBreakdown` to the domain.js import (it was missing); (2) wrapped the `"N Influence remaining"` budget text in a `<span class="dt-influence-budget-label" title="...">` where the title is built from `influenceBreakdown(currentChar).join('\n')` with fallback "No influence sources"; (3) added CSS `.dt-influence-budget-label[title]` mirroring `.dt-xp-deficit[title]` but using `--gold2` accent.

Test discovery: section key is `"territory"` not `"city"`. `influenceBreakdown` uses `"Clan Status"` for `st.clan` (not "City Status"). All 4 E2E tests pass.

### Change Log

| Date | Author | Change |
|---|---|---|
| 2026-05-07 | James (story) | Story enriched from Draft to ready-for-dev. Root cause: influenceBreakdown not imported, budget text is a bare text node. Pattern: mirror .dt-xp-deficit[title] using gold accent. |
| 2026-05-07 | James (dev) | Implemented 3 changes across 2 files; 4 E2E tests pass. Status → review. |
