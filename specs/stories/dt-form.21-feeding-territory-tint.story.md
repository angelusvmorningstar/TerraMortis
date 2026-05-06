---
id: dt-form.21
task: 21
issue: 75
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/75
branch: morningstar-issue-75-feeding-territory-tinting
epic: epic-dt-form-mvp-redesign
status: review
priority: medium
depends_on: ['dt-form.17']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (Implementation Plan)
---

# Story dt-form.21 — Feeding territory tinting (green/red regardless of selection)

As a player choosing a feeding territory,
I should see green tinting on territories where I have feeding rights / regency / lieutenancy and red tinting on barrens / no-rights territories — visible regardless of whether the territory is currently selected,
So that I can make an informed selection at a glance without selecting each chip to discover its status.

## Context

Currently the residency badge in the feeding territory selector only tints when the territory is selected. Per Piatra (2026-05-06), this should change: green-tint background if the character has feeding rights / regent / lieutenant in that territory; red-tint if barrens or no rights. Tint visible in both selected and unselected states.

Feeding-rights data is canonical at `territories.feeding_rights[]` (post-fix.39). Regent and lieutenant relationships are implicit per RFR.1 — the rights check must include all three:

```
hasFeedingRights(c, t) = t.feeding_rights.includes(String(c._id))
                      || String(t.regent_id) === String(c._id)
                      || String(t.lieutenant_id) === String(c._id)
```

### Files in scope

- `public/js/tabs/downtime-form.js` — the feeding territory chip render path
- CSS — green / red tint variants. Match existing tint patterns if any (search `dt-chip-*` for precedents); otherwise add `dt-chip-territory-rights` / `dt-chip-territory-barrens` classes

### Files NOT in scope

- The feeding-rights data model (already canonical via `territories.feeding_rights[]`)
- Territory editor / regent-management UI (separate flow)
- The simplified MINIMAL feeding shape (#20 — separate concern; both stories operate on the same chip surface)

## Acceptance Criteria

**Given** a character has feeding rights, regency, or lieutenancy on a territory
**When** the feeding territory chip set renders
**Then** that chip has the green-tint background applied. Visible in both selected and unselected states.

**Given** a territory is barrens (or the character has no rights / regency / lieutenancy)
**When** the chip renders
**Then** that chip has the red-tint background applied. Visible in both states.

**Given** the chip is currently selected
**When** the visual treatment renders
**Then** the selection state is layered on top of the tint (e.g. selection ring + tint background). Both signals are simultaneously legible.

**Given** the rights check
**When** evaluated for a character
**Then** it returns true for any of: `feeding_rights.includes(String(c._id))`, `String(regent_id) === String(c._id)`, `String(lieutenant_id) === String(c._id)`.

**Given** the chip set re-renders mid-session (e.g. after a regent change)
**When** the same character's feeding chip set is re-rendered
**Then** the tint reflects the updated state without needing a full reload (couples cleanly with #13b's drop-the-cache pattern that just shipped).

## Implementation Notes

### The one-line mental model

The current `activeClass` is conditional on `isActive` (territory is selected). This story makes the tint **unconditional** — always applied based on rights status — and adds a separate `selectedClass` for the selection overlay.

### Exact change — `public/js/tabs/downtime-form.js`

**Lines 5485–5487 + 5503** inside `renderFeedingTerritoryPills()`:

```javascript
// REMOVE these three lines (5485–5487):
const activeClass = isActive
  ? (isBarrens ? ' dt-terr-pill-barrens' : (hasFeedingRights ? ' dt-terr-pill-rights' : ' dt-terr-pill-poach'))
  : '';

// REPLACE with:
const tintClass = (isBarrens || !hasFeedingRights) ? ' dt-terr-pill-barrens' : ' dt-terr-pill-rights';
const selectedClass = isActive ? ' dt-terr-pill--selected' : '';
```

```javascript
// UPDATE line 5503 — change activeClass → tintClass + selectedClass:
// OLD:
h += `<button type="button" class="dt-terr-pill${activeClass}${disabledClass}"${disabledAttrs}`;
// NEW:
h += `<button type="button" class="dt-terr-pill${tintClass}${selectedClass}${disabledClass}"${disabledAttrs}`;
```

`dt-terr-pill-poach` (orange, line 5486) is no longer assigned after this change. Leave the CSS class defined in `components.css` — just stop applying it.

### CSS additions — `public/css/components.css`

Add after line 3783 (after `.dt-terr-pill-disabled` rule):

```css
/* dt-form.21: selection ring layered over always-on tint */
.dt-terr-pill--selected { outline: 2px solid var(--gold2); outline-offset: 2px; }
.dt-terr-pill-rights.dt-terr-pill--selected { background: rgba(34,120,60,.28); border-color: rgba(34,120,60,.7); }
.dt-terr-pill-barrens.dt-terr-pill--selected { background: rgba(139,0,0,.22); border-color: rgba(139,0,0,.55); }
```

### Why the click handler needs no changes

The click handler at line 2883 calls `renderForm(container)` — a full re-render — on every pill click. `renderFeedingTerritoryPills` recomputes `tintClass` and `selectedClass` from hidden input values + rights check on each render. No direct class manipulation; zero stale state risk.

### Re-render mid-session (AC 5)

`renderFeedingTerritoryPills` reads `_territories` and `currentChar._id` on every call. Any change that triggers a re-render (e.g., a regent update) will reflect updated tints automatically — no extra wiring required.

### No rights check helper extraction this story

The `hasFeedingRights` logic lives in the render loop (lines 5467–5472) and covers all three fields (feeding_rights[], regent_id, lieutenant_id). ADR-003's cross-suite-helper gate means extraction to `helpers.js` is deferred. Keep it form-local for this story's scope.

## Test Plan

- Static review: rights check correctly checks all three fields; tint applied regardless of selection state
- Browser smoke (DEFERRED): walk through a character's feeding chips; confirm green/red tints match their feeding-rights status; select/deselect a chip and confirm tint persists

## Definition of Done

- [x] Feeding territory chips green-tint on rights/regency/lieutenancy
- [x] Red-tint on barrens / no-rights
- [x] Tint visible regardless of selection state
- [x] Rights check includes all three fields (feeding_rights, regent_id, lieutenant_id)
- [ ] PR opened into `dev`

## Dev Agent Record

**Agent:** Claude Sonnet 4.6 (James)
**Date:** 2026-05-06

### File List

**Modified**
- `public/js/tabs/downtime-form.js` — replaced `activeClass` (conditional on selection) with `tintClass` (always-on) + `selectedClass` (selection overlay) inside `renderFeedingTerritoryPills()`
- `public/css/components.css` — added `.dt-terr-pill--selected` (gold outline ring) plus stronger-tint combination rules for `rights+selected` and `barrens+selected` states

### Completion Notes

Two-line JS change + three CSS rules. `activeClass` was conditional on `isActive`; replaced with `tintClass` (always applied — green for rights, red for barrens/no-rights) and `selectedClass` (gold outline ring when active). Click handler calls `renderForm()` for a full re-render so no direct DOM mutation needed. `dt-terr-pill-poach` CSS class is now unreferenced — left in place, not deleted.

Static review: rights check at lines 5467–5472 already covers all three fields (`feeding_rights[]`, `regent_id`, `lieutenant_id`). No helper extraction this story (ADR-003 cross-suite-helper gate). Browser smoke deferred per Test Plan.

### Change Log

| Date | Author | Change |
|---|---|---|
| 2026-05-06 | James (dev) | Always-on tint in `renderFeedingTerritoryPills`: green for rights, red for barrens/no-rights. Selection ring layered via `.dt-terr-pill--selected`. Status → review. |
| 2026-05-06 | Quinn (QA) → James (dev) | Added hover overrides for `.dt-terr-pill-rights:hover` and `.dt-terr-pill-barrens:hover` to prevent hover specificity beating always-on tint on unselected pills. |

## Dependencies

- **Upstream**: #17 (rendering gate; this surface lives within the feeding section which renders in MINIMAL)
- **Soft co-ordination**: #20 (simplified feeding) — same chip surface; #21 is purely visual; merge order doesn't matter but conflicts in the same render path likely
- **Downstream**: none
