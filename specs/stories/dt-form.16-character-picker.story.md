---
id: dt-form.16
task: 16
epic: epic-dt-form-mvp-redesign
status: Done
priority: high
depends_on: []
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (§Q6, §Q10)
issue: 55
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/55
---

# Story dt-form.16 — Universal character picker component

As an author of any DT form section that needs to select a character (or set of characters),
I should have a single component to consume — `charPicker({...})` — with two scope variants and one render shape,
So that the five existing divergent picker shapes collapse to one and future sections don't reinvent the same UX.

This is **foundation story #1 of 2** (the other is #17). Must merge before any per-section story.

---

## Context

ADR-003 §Q6 locks the universal character picker decision: one component, two scoped variants, one render shape. The five existing picker sites (`dt-flex-char-sel` single-select at `:4817`, `dt-chip` button grid at `:5000`, project-cast checkbox grid at `:508`/`:2367`, last-game-attendees subset at `:1332`, regency tab `<select id="reg-slot-N">` at `regency-tab.js:192-199`) all replace their local pickers with calls to the new component.

Component location: `public/js/components/character-picker.js` (new). Form-local consumption only in this epic; broader adoption deferred to a future ADR per ADR-003 §Out-of-scope.

ADR-003 §Q10 locks the keyboard model: WAI-ARIA combobox (`role="combobox"`, `aria-expanded`, `aria-activedescendant`) with standard tab/arrow/enter/escape semantics.

ADR-003 §Q6 also locks the `excludeIds` parameter as v1 (not deferred) so ALLY-attach pickers can exclude self without revisiting consumers later.

### Files in scope

- `public/js/components/character-picker.js` (new)
- `public/js/tabs/downtime-form.js` — replace 5 picker sites listed above
- `public/js/tabs/regency-tab.js` — replace `<select id="reg-slot-N">` at `:192-199`
- CSS: existing `dt-chip` and `qf-select` styling adapted or new `char-picker-*` rules added — implementer's choice; stay form-local

### Files NOT in scope

- Any picker outside the DT form context (admin character editor, etc.) — broader adoption is a future ADR
- The reference data sources (`allCharNames`, `lastGameAttendees`) themselves — already module-scoped in `downtime-form.js`; the component reads them but doesn't reshape them

---

## Acceptance Criteria

**Given** the component is imported and called as `charPicker({ scope: 'all', cardinality: 'single', initial: charId, onChange: fn, placeholder: 'pick a character', excludeIds: [] })`
**When** the component renders
**Then** a single text input with a fuzzy-matching dropdown appears; mouse + keyboard navigable; current selection rendered as a confirmed pill.

**Given** `cardinality: 'multi'`
**When** the user selects multiple characters
**Then** each selection renders as a removable chip; the dropdown stays open after each pick; clicking the chip's × removes that selection and updates `onChange` with the new array.

**Given** `scope: 'all'`
**When** the dropdown filters
**Then** the source list is `allCharNames` (already module-scoped in `downtime-form.js:43`).

**Given** `scope: 'attendees'`
**When** the dropdown filters
**Then** the source list is `lastGameAttendees` (already module-scoped at `:67`).

**Given** `excludeIds: ['someCharId']`
**When** the dropdown renders
**Then** the listed character ids are filtered out of the dropdown options. The selection input behaves correctly even if `excludeIds` changes between renders.

**Given** the picker is keyboard-focused
**When** the user types
**Then** the dropdown narrows progressively (fuzzy match, case-insensitive). Tab navigates focus, arrow-keys move within the dropdown, Enter selects, Escape cancels.

**Given** WAI-ARIA combobox semantics are required
**When** assistive tech inspects the picker
**Then** `role="combobox"` is on the input, `aria-expanded` reflects dropdown state, `aria-activedescendant` points at the focused option. Tab/arrow/Enter/Escape are wired per the standard combobox pattern.

**Given** the 5 existing picker sites listed in ADR-003 §Audit-baseline
**When** they are migrated in this story
**Then** each site's HTML is replaced by a `charPicker(...)` call configured with the appropriate `scope` and `cardinality` (single for sites #1, #2, #5; multi for site #3; attendees-scope for site #4).

**Given** the migration is reviewed
**When** a developer greps the codebase
**Then** zero remaining instances of the 5 audit-baseline locator patterns exist (`dt-flex-char-sel`, `dt-chip data-project-target-char` direct render — though the `dt-chip` class may persist on the new component's chip rendering — and the regency `<select id="reg-slot-N">` direct render).

**Given** the component is form-local only
**When** the diff is reviewed for scope discipline
**Then** the component file is at `public/js/components/character-picker.js` and is imported only by `downtime-form.js` (and `regency-tab.js` if the regency picker is also migrated). No imports from admin-app or other suite surfaces.

---

## Implementation Notes

### Component signature (lock)

```js
export function charPicker({
  scope: 'all' | 'attendees',     // source list
  cardinality: 'single' | 'multi', // selection mode
  initial: string[] | string,      // initial value
  onChange: (next) => void,        // change handler
  placeholder: string,             // for empty state
  excludeIds?: string[],           // hide these (e.g. self)
})
```

### Fuzzy-match shape

ADR-003 names "fuzzy-matching text input with progressively-narrowing dropdown list". Implementer's choice on the matcher (substring match, prefix-weighted, etc.) — keep it simple; the source lists are 30-ish characters, not 30,000.

### Migration order within this PR

1. Build the component in `public/js/components/character-picker.js` with all 6 parameters wired.
2. Replace site #1 (`dt-flex-char-sel` single-select). Smoke-test the section.
3. Replace site #2 (`dt-chip` project-target-char single-select). Smoke-test.
4. Replace site #3 (project-cast multi-select checkbox grid). Smoke-test.
5. Replace site #4 (last-game-attendees subset, `attendees` scope). Smoke-test.
6. Replace site #5 (regency tab `<select id="reg-slot-N">`). Smoke-test.

If any site reveals a missing capability (e.g. needs `disabled` per-option, needs to render the empty-list state differently), surface in DAR before extending the component signature.

---

## Test Plan

1. **Static review** (Ma'at) — component signature matches ADR-003 §Q6; ARIA roles match §Q10.
2. **Server tests** — no new server impact; existing suites should remain green.
3. **Browser smoke** (DEFERRED to user/SM if Ptah can't run from terminal):
   - Each of the 5 migrated sites renders correctly
   - Keyboard navigation works at each
   - Multi-select chips render and remove cleanly
   - `excludeIds` exclusion works (e.g. ALLY picker excludes self)
   - Existing form draft data round-trips correctly through the new picker

---

## Definition of Done

- [x] `public/js/components/character-picker.js` exists with the locked signature
- [x] All 5 audit-baseline picker sites migrated to `charPicker(...)`
- [x] Component is form-local (only `downtime-form.js` and `regency-tab.js` import it)
- [x] WAI-ARIA combobox semantics present and verified
- [x] `excludeIds` parameter wired and used by at least one consumer (regency-tab cross-slot exclusion + joint-invitee no-free-slot exclusion)
- [ ] Browser smoke confirms each migrated site behaves equivalently or better than before  *(deferred to user/SM per story Test Plan)*
- [ ] PR opened by `tm-gh-pr-for-branch` into `dev`, body links to ADR-003 §Q6 + §Q10

---

## Dev Agent Record

**Agent Model Used:** James (BMAD `dev`) — Claude Opus 4.7

### Tasks
- [x] Build `public/js/components/character-picker.js` with locked signature, source registry, WAI-ARIA combobox semantics, fuzzy match, single/multi cardinality.
- [x] Migrate site #1 — `dt-flex-char-sel` single-select in `renderTargetPicker`.
- [x] Migrate site #2 — `data-project-target-char` chip single-select in `renderTargetCharOrOther`.
- [x] Migrate site #3a — joint-target multi-checkbox grid in `renderTargetPicker`.
- [x] Migrate site #3b — joint-invitee multi-chip grid in `renderJointInviteeChips`.
- [x] Migrate site #4 — `shoutout_picks` (attendees-scope multi, 3-pick cap preserved via consumer-side remount-on-overflow).
- [x] Migrate site #5 — regency `<select id="reg-slot-N">` slots; cross-slot exclusion via dynamic excludeIds.
- [x] Add `.char-picker__*` design-token-driven CSS in `public/css/components.css`.
- [x] Parse-check changed JS modules; run server `npm test`.
- [x] Update Tasks/File List/Completion Notes; set status `Ready for Review`.

### File List
- `public/js/components/character-picker.js` (new)
- `public/js/tabs/downtime-form.js` (modified)
- `public/js/tabs/regency-tab.js` (modified)
- `public/css/components.css` (modified)
- `specs/stories/dt-form.16-character-picker.story.md` (this file — Dev Agent Record only)

### Completion Notes
- Locked signature `charPicker({ scope, cardinality, initial, onChange, placeholder, excludeIds })` honoured exactly. Returns an `HTMLElement` rooted at `.char-picker`. Source data is published via the auxiliary `setCharPickerSources({ all, attendees })` exported from the same module so the picker's option list is form-local but the locked construction call carries no items array.
- Re-render survival: each picker render site emits a placeholder `<div data-cp-mount …>`; after `container.innerHTML = h`, `mountCharPickers(container)` (downtime-form) / `_mountRegSlotPickers(container)` (regency-tab) replace placeholders with live components. Existing collection paths are preserved by writing the picker's value to a hidden input mirrored on each `onChange`.
- WAI-ARIA combobox: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`, `aria-haspopup="listbox"`, `aria-activedescendant`. Listbox uses `role="listbox"` with `role="option"` children. Keyboard model: ArrowUp/Down navigate, Enter commits, Escape closes/clears, Backspace on empty input removes the last chip in multi mode.
- `excludeIds` is honoured on construction; "survives mid-render changes" is achieved by remounting (regency cross-slot, shoutout 3-cap overflow). The locked signature has no max-cardinality parameter, so the shoutout 3-pick cap is enforced consumer-side by trimming and remounting the picker with the prior 3 — surfacing as a notable but in-scope decision (no DAR raised; alternative would be a `maxSelections` field on the signature, which `Out of scope`).
- Server tests: 2 failures observed (`api-relationships-player-create.test.js > GET /api/npcs/directory > returns active + pending NPCs`; `rule_engine_grep.test.js > Rule engine effective-rating grep contract` flagging `m.cp || 0` and `m.xp || 0` in `auto-bonus-evaluator.js` and `pool-evaluator.js`). Both pre-existing on `dev`; neither file is touched by this branch. 634/636 tests pass.
- Browser smoke is deferred to the user/SM per the story Test Plan.

### Change Log
| Date | Author | Change |
|---|---|---|
| 2026-05-06 | James (dev) | Implemented charPicker component and migrated all 5 audit-baseline picker sites; wired CSS; story status → Ready for Review. |

---

## Dependencies

- **None upstream.** This is the first story to land.
- Downstream: blocks #18, #20, #22, #23, #24, #28 (every per-section story that consumes a picker).
