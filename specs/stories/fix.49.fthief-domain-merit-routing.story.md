---
id: fix.49
task: 49
issue: 6
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/6
branch: morningstar-issue-6-fthief-domain-merit-routing
epic: merit-editor
status: review
priority: medium
---

# Story fix.49 — Fucking Thief: route stolen domain merits to domain category

As an ST editing a Carthian character who uses Fucking Thief,
When I select a domain merit (e.g. Mandragora Garden) as the stolen qualifier,
The stolen merit should appear in the Domain Merits section of the sheet — not under Kindred/general merits.

## Context

Fucking Thief (Carthian merit) lets the character "steal" a single 1-dot non-Carthian merit. The
qualifier picker (`buildFThiefOptions` in `public/js/editor/merits.js`) correctly surfaces domain
merits as valid options. But the add/remove path in `shEditGenMerit` always writes
`category: 'general'` regardless of the stolen merit's true type.

`DOMAIN_MERIT_TYPES` (`public/js/data/constants.js:125`):
`['Safe Place', 'Haven', 'Feeding Grounds', 'Herd', 'Mandragora Garden']`

These belong in the Domain Merits section. Mandragora Garden specifically grants +3 to Crúac pools
and is used extensively in downtime-views.js — it must appear in the correct section and the
category-agnostic name-based pool lookups must continue to work.

### Prior Fucking Thief story

Fix.19 (`fix.19.fucking-thief-no-free-dot.story.md`, status: done) removed the erroneous `free: 1`
grant. The current code at lines 108–122 of `edit-domain.js` is the post-fix.19 state — no `free`
field is set. Do not re-introduce it.

## Files in Scope

- `public/js/editor/edit-domain.js` — add import + helper function + update Fucking Thief block
- No other files

## Files NOT in Scope

- `public/js/editor/merits.js` — `buildFThiefOptions` is correct; domain merits must remain valid picker options
- `public/js/data/constants.js` — `DOMAIN_MERIT_TYPES` is correct as-is
- `public/js/editor/sheet.js` — no rendering changes needed (see Dev Notes)
- `public/js/admin/downtime-views.js` — Mandragora lookups are already category-agnostic
- Any server file
- No data migration — fix applies going forward only

## Acceptance Criteria

**AC-1 — Domain merit stolen → stored as category: 'domain'**
Given a Carthian character with Fucking Thief
When the ST selects Mandragora Garden (or any `DOMAIN_MERIT_TYPES` merit) as the stolen qualifier
Then the stolen merit entry in `c.merits` has `category: 'domain'` and `granted_by: 'Fucking Thief'`

**AC-2 — Stolen domain merit renders in Domain Merits section**
Given AC-1 applies
When the sheet renders in edit mode
Then the stolen Mandragora Garden appears in the Domain Merits section, not under Kindred/general merits

**AC-3 — Non-domain merits still stored as category: 'general'**
Given a Carthian character with Fucking Thief
When the ST selects a non-domain merit (e.g. Striking Looks 1)
Then the stolen entry has `category: 'general'` as before (no regression)

**AC-4 — Swap correctly removes previous entry regardless of category**
Given a character has an existing stolen merit (either category)
When the ST changes the Fucking Thief qualifier to a different merit
Then the previous stolen entry is removed (category-agnostic removal) and the new entry is added with the correct category

**AC-5 — Crúac pool math unaffected**
Given a character has a stolen Mandragora Garden (now category: 'domain')
Then `downtime-views.js` Crúac pool lookups (`.some(m => m.name === 'Mandragora Garden')`) continue to work — they are category-agnostic and require no change

**AC-6 — No migration of existing data**
Characters with a legacy stolen domain merit stored as `category: 'general'` are not touched.
The fix applies only to new qualifier selections going forward.

## Implementation Notes

### The exact change — `public/js/editor/edit-domain.js`

**Current imports (line 6):**
```javascript
import { getRuleByKey } from '../data/loader.js';
```

**Change 1 — add import (line 7, after the loader import):**
```javascript
import { DOMAIN_MERIT_TYPES } from '../data/constants.js';
```

**Change 2 — add helper function (after `ruleKeyFor`, before the `_markDirty` / `_renderSheet` block ~line 14):**
```javascript
function stolenMeritCategory(name) {
  const slug = (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const rule = getRuleByKey(slug);
  if (rule?.sub_category === 'domain') return 'domain';
  return DOMAIN_MERIT_TYPES.includes(name) ? 'domain' : 'general';
}
```

Why the two-stage check: `getRuleByKey` with the slug is the authoritative source (covers any future
domain merits added to the rules DB). `DOMAIN_MERIT_TYPES.includes(name)` is the fallback for rules
that may not be loaded yet (rules are loaded async; the DB may be empty on first render).

**Change 3 — update the Fucking Thief block in `shEditGenMerit` (lines 108–122 current):**

Current:
```javascript
if (m.name === 'Fucking Thief') {
  if (prevQualifier && prevQualifier !== val) {
    const oldIdx = (c.merits || []).findIndex(x => x.name === prevQualifier && x.category === 'general' && x.granted_by === 'Fucking Thief');
    if (oldIdx >= 0) removeMerit(c, oldIdx);
  }
  if (val) {
    let newIdx = (c.merits || []).findIndex(x => x.name === val && x.category === 'general' && x.granted_by === 'Fucking Thief');
    if (newIdx < 0) {
      addMerit(c, { category: 'general', name: val, rating: 0, granted_by: 'Fucking Thief' });
      newIdx = c.merits.length - 1;
    }
  }
}
```

Replace with:
```javascript
if (m.name === 'Fucking Thief') {
  if (prevQualifier && prevQualifier !== val) {
    // Category-agnostic removal handles both legacy 'general' and new 'domain' entries
    const oldIdx = (c.merits || []).findIndex(x => x.name === prevQualifier && x.granted_by === 'Fucking Thief');
    if (oldIdx >= 0) removeMerit(c, oldIdx);
  }
  if (val) {
    const newCat = stolenMeritCategory(val);
    const alreadyExists = (c.merits || []).some(x => x.name === val && x.granted_by === 'Fucking Thief');
    if (!alreadyExists) {
      addMerit(c, { category: newCat, name: val, rating: 0, granted_by: 'Fucking Thief' });
    }
  }
}
```

Key differences:
- Removal path: drops `x.category === 'general'` filter → finds existing entry regardless of whether
  it was stored as 'general' (legacy) or 'domain' (new). Handles AC-4 and avoids leaving orphaned
  entries when a user swaps away from a legacy incorrectly-categorised merit.
- Add path: uses `stolenMeritCategory(val)` to determine correct category → AC-1 and AC-3.
- Existence check: also category-agnostic (`.some(x => x.name === val && x.granted_by === ...)`) to
  prevent duplicates across categories.
- The unused `newIdx = c.merits.length - 1` assignment is removed (it was never read).

### Why the domain section renders the stolen entry correctly without further changes

The domain section in `sheet.js` renders ALL `category: 'domain'` merits through the standard
`domM.forEach` loop, including Lorekeeper-granted ones (`granted_by: 'Lorekeeper'`). The stolen
domain merit will appear there as a normal domain merit row — editable via `shEditDomMerit`. This
is the existing pattern; no special handling is required.

The general section's `granted_by` guard (line 1175) renders granted general merits as read-only
tag rows. After this fix, no stolen domain merit will appear in the general section, so that guard
is unaffected.

### Why _FREE_TEXT_QUAL is not a concern

`_FREE_TEXT_QUAL` (line 1173 in `sheet.js`) applies only to non-granted general merits (the check
at line 1188 follows the `if (m.granted_by)` read-only block at line 1175 — granted merits never
reach it). The stolen merit has `granted_by: 'Fucking Thief'`, so `_FREE_TEXT_QUAL` was never
active for it in the general section. Moving it to domain changes nothing about this path.

### Why Mandragora Garden pool math is unaffected (AC-5)

Both Crúac pool lookup sites in `downtime-views.js` use:
```javascript
(char?.merits || []).some(m => m.name === 'Mandragora Garden')
```
No `category` filter. Safe regardless of where the merit lives.

### What NOT to touch

- `buildFThiefOptions` in `merits.js` — domain merits must remain selectable options (issue scope note)
- `meritByCategory` in `merits.js` — correct, not involved
- `shEditDomMerit` / `shRemoveDomMerit` — correct, not involved
- The `granted_by: 'Fucking Thief'` marker — preserves prereq-warning suppression in `audit.js:277`
  and `sheet.js:78`
- Any server file or MongoDB migration

## Test Plan

This story has no Playwright suite (merit editor tests require browser + admin login; no existing
Playwright harness for the editor exists). Verification is manual smoke in the admin editor:

1. Open Admin → edit a Carthian character who has Fucking Thief merit
2. Select "Mandragora Garden" as the Fucking Thief qualifier
3. Verify: merit appears in **Domain Merits** section (not Kindred/general), with "Fucking Thief" tag
4. Verify: `category: 'domain'` in the saved character (check via MongoDB or browser devtools)
5. Change qualifier to a non-domain merit (e.g. "Striking Looks")
   - Verify: old Mandragora Garden entry removed from Domain section
   - Verify: new entry in general merits section
6. Change qualifier back to a domain merit
   - Verify: new domain entry appears in Domain Merits section; no orphan in general
7. Verify Crúac pool still calculates correctly for the character in downtime-views

## Definition of Done

- [x] `DOMAIN_MERIT_TYPES` imported in `edit-domain.js`
- [x] `stolenMeritCategory()` helper added
- [x] Fucking Thief block updated — removal category-agnostic, add uses `stolenMeritCategory`
- [x] AC-1: stolen domain merit has `category: 'domain'`
- [x] AC-2: stolen domain merit renders in Domain Merits section
- [x] AC-3: stolen non-domain merit still `category: 'general'`
- [x] AC-4: swap removes old entry regardless of stored category
- [x] AC-5: Crúac pool math unaffected (category-agnostic name lookup, no code change needed)
- [x] AC-6: no migration run, no existing data touched
- [ ] PR opened into `dev`

## Dev Agent Record

**Agent:** Claude (Morningstar)
**Date:** 2026-05-07

### File List

**Modified**
- `public/js/editor/edit-domain.js`

### Completion Notes

Three edits to `edit-domain.js`:
1. Added `import { DOMAIN_MERIT_TYPES } from '../data/constants.js'` (line 7).
2. Added `stolenMeritCategory(name)` helper after `ruleKeyFor` — checks `rule.sub_category === 'domain'` first (authoritative, covers future rules DB additions), falls back to `DOMAIN_MERIT_TYPES.includes(name)` for the async-load window where rules may not yet be cached.
3. Updated the Fucking Thief block in `shEditGenMerit`: removal path drops the `x.category === 'general'` filter (category-agnostic, handles legacy stored entries on swap); add path uses `stolenMeritCategory(val)` for the correct category; existence check is also category-agnostic. The unused `newIdx = c.merits.length - 1` assignment was removed.

No automated tests — merit editor requires browser + admin login. Manual smoke required per Test Plan.

### Change Log

| Date | Author | Change |
|---|---|---|
| 2026-05-07 | Claude (Morningstar) | Story created from issue #6. |
| 2026-05-07 | Claude (Morningstar) | Implemented: DOMAIN_MERIT_TYPES import, stolenMeritCategory helper, Fucking Thief block updated. Status → review. |
