---
id: dt-form.35
issue: 113
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/113
branch: morningstar-issue-113-feeding-method-highlight-sync
epic: epic-dt-form-mvp-redesign
status: done
priority: high
depends_on: ['dt-form.17', 'dt-form.20']
---

# Story dt-form.35 — Fix: Kiss/Violent button highlighted from default but not registered in collectResponses()

As a player filling out the ADVANCED feeding section,
When The Kiss (or The Assault) button is pre-highlighted because my feeding method has a default violence mode,
The form should treat that pre-selection as valid and not block my submission with "Feeding: choose Kiss or Violent".

## Root Cause

### The two-path problem

The Kiss/Violent toggle buttons render their highlight from two sources:

```javascript
// downtime-form.js ~line 6570
const persistedViolence = responseDoc?.responses?.feed_violence || '';
const preselect = persistedViolence || (FEED_VIOLENCE_DEFAULTS[feedMethodId] || '');

h += `<button … class="dt-feed-vi-btn${preselect === 'kiss' ? ' dt-feed-vi-on' : ''}" …>The Kiss</button>`;
h += `<button … class="dt-feed-vi-btn${preselect === 'violent' ? ' dt-feed-vi-on' : ''}" …>The Assault</button>`;
```

`FEED_VIOLENCE_DEFAULTS` (in `downtime-data.js`):
```javascript
export const FEED_VIOLENCE_DEFAULTS = {
  seduction:    'kiss',
  stalking:     null,
  force:        'violent',
  familiar:     'kiss',
  intimidation: 'violent',
  other:        null,
};
```

So if `feedMethodId` is `'seduction'` or `'familiar'`, The Kiss renders highlighted — even if the player never explicitly clicked it.

`collectResponses()` only writes `feed_violence` if the player has already explicitly clicked the button and that click was saved into `responseDoc.responses.feed_violence`:

```javascript
// downtime-form.js ~line 400 (the DTFP-5 comment)
// DTFP-5: feed_violence persists only after the player clicks the toggle.
// Pre-selection is visual only; preserve any explicit choice through saves.
if (responseDoc?.responses?.feed_violence) {
  responses.feed_violence = responseDoc.responses.feed_violence;
}
```

The minimum-complete check then reads `responses.feed_violence` (the collected bag, not `responseDoc`):

```javascript
// dt-completeness.js line 76-77
function _hasFeedingViolence(responses) {
  return isNonEmptyString(responses.feed_violence);
}
```

**Result:** The Kiss button is visually highlighted (from default), but `responses.feed_violence` is empty, so `_hasFeedingViolence()` returns false → "Feeding: choose Kiss or Violent" blocker.

### Why some characters are unaffected

Characters whose methods have `FEED_VIOLENCE_DEFAULTS[methodId] = null` (e.g. `stalking`, `other`) show no highlight, so players know to click. Characters whose method has a non-null default see the button highlighted and reasonably believe no action is needed — the bug only manifests when the default is non-null but `feed_violence` was never explicitly persisted.

### Reproducer

Cyrus: method has a `kiss` default → The Kiss highlighted on load → minimum-complete still blocks. Cazz: method has no default → neither highlighted → player clicks → no issue.

## The Fix — `public/js/tabs/downtime-form.js`

In `collectResponses()`, extend the `feed_violence` logic (the `feeding_method` section, ~line 400) to fall back to `FEED_VIOLENCE_DEFAULTS[feedMethodId]` when no explicit choice is saved — matching the render logic exactly:

**Before:**
```javascript
// DTFP-5: feed_violence persists only after the player clicks the toggle.
// Pre-selection is visual only; preserve any explicit choice through saves.
if (responseDoc?.responses?.feed_violence) {
  responses.feed_violence = responseDoc.responses.feed_violence;
}
```

**After:**
```javascript
// dt-form.35: fall back to method default so visual highlight matches what
// collectResponses writes — fixes "choose Kiss or Violent" false block.
const _explicitViolence = responseDoc?.responses?.feed_violence;
const _defaultViolence = feedMethodId ? (FEED_VIOLENCE_DEFAULTS[feedMethodId] || null) : null;
const _violence = _explicitViolence || _defaultViolence;
if (_violence) responses.feed_violence = _violence;
```

`FEED_VIOLENCE_DEFAULTS` is already imported at the top of `downtime-form.js` (via `import { …, FEED_VIOLENCE_DEFAULTS, … } from './downtime-data.js'`). No new imports needed.

That is the entire fix. One logical change in one place. No changes to `dt-completeness.js`, the render path, or any other file.

## Files in Scope

- `public/js/tabs/downtime-form.js` — `collectResponses()` only (~line 400)

## Files NOT in Scope

- `public/js/data/dt-completeness.js` — `_hasFeedingViolence()` is correct; the fix is upstream
- `public/js/tabs/downtime-data.js` — `FEED_VIOLENCE_DEFAULTS` is correct; no changes
- Render code (~line 6570) — already correct; `collectResponses()` will now match it
- MINIMAL mode feeding form — not affected (MINIMAL does not render the Kiss/Violent toggle)

## Acceptance Criteria

- [ ] Given a character whose feeding method has a `FEED_VIOLENCE_DEFAULTS` entry (e.g. `seduction` → kiss, `familiar` → kiss, `force` → violent, `intimidation` → violent), when the ADVANCED feeding section loads with that method selected but no explicit `feed_violence` in the submission, then The Kiss (or The Assault) button is highlighted AND the minimum-complete check does not flag "choose Kiss or Violent"
- [ ] Given the same character clicks a different violence button, the explicit choice overrides the default and is saved correctly
- [ ] Given a character whose method has `FEED_VIOLENCE_DEFAULTS[methodId] = null` (e.g. `stalking`, `other`), neither button is highlighted on load and the validation still requires an explicit click (no regression)
- [ ] Given a character with no method selected, `feed_violence` is not seeded from the default (no stale state)
- [ ] No regression on MINIMAL mode feeding form

## Test Plan

Static review:
- `collectResponses()` now derives `feed_violence` as `explicit || FEED_VIOLENCE_DEFAULTS[feedMethodId] || null`
- `FEED_VIOLENCE_DEFAULTS` is not duplicated — imported reference used directly

Browser smoke (required before PR):
1. Open Cyrus in ADVANCED. Confirm The Kiss is highlighted AND minimum-complete does not flag "choose Kiss or Violent"
2. Click The Assault on Cyrus — confirm it switches highlight AND saves correctly on submit
3. Open a character with `stalking` or `other` method in ADVANCED. Confirm neither button is highlighted and validation still requires a click
4. MINIMAL mode: open any character, confirm feeding section renders correctly (no Kiss/Violent toggle in MINIMAL — no regression possible)

## Definition of Done

- [x] `collectResponses()` feeds `feed_violence` from `FEED_VIOLENCE_DEFAULTS[feedMethodId]` when no explicit choice is saved
- [x] No other files changed
- [ ] Smoke test 1: Cyrus loads without "choose Kiss or Violent" blocker
- [ ] Smoke test 2: explicit click overrides default and saves
- [ ] Smoke test 3: null-default method still requires explicit click
- [ ] PR opened into `dev`

## Dev Agent Record

**Agent:** Claude Sonnet 4.6
**Date:** 2026-05-07

### File List

**Modified**
- `public/js/tabs/downtime-form.js` — `collectResponses()` violence logic updated (~line 400)

### Completion Notes

Single change in the `feeding_method` branch of `collectResponses()`. Replaced the bare `if (responseDoc?.responses?.feed_violence)` guard with a two-source derivation:
- `_explicitViolence` = what the player explicitly clicked and saved
- `_defaultViolence` = `FEED_VIOLENCE_DEFAULTS[feedMethodId]` (same source the render uses)
- `_violence = _explicitViolence || _defaultViolence`

Now `collectResponses()` and the render's `preselect` use identical logic. Characters whose method has a non-null default (seduction/familiar → kiss; force/intimidation → violent) will have `feed_violence` in the collected responses without requiring an explicit click. Explicit clicks still override the default correctly.

The render already has a hint "Pre-selected based on your method. Click to confirm or change." — this remains accurate (clicking still changes it), though it no longer implies confirmation is mandatory.

### Change Log

| Date | Author | Change |
|---|---|---|
| 2026-05-07 | Claude Sonnet 4.6 | Implemented fix: collectResponses() feeds feed_violence from FEED_VIOLENCE_DEFAULTS fallback. Status → review. |
