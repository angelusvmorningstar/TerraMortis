---
id: hotfix.45
issue: 45
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/45
branch: angelus/issue-45-retainer-granted-merit-detect
status: done
priority: critical
depends_on: []
labels: [bug, cycle-blocker, dt-form]
---

# Story hotfix.45 — detectMerits() walks granted merits for DT action surfacing

As a player whose merits are held via a standing-merit grant chain,
I should see the corresponding DT actions (Retainer, Mentor, Staff, Contacts) in the form,
So that I can take actions on merits I genuinely own even if they were granted rather than purchased directly.

---

## Context

`detectMerits()` in `public/js/tabs/downtime-form.js` populates `detectedMerits.*` — the buckets that control which per-merit action sections render. It currently walks `currentChar.merits[]` for direct ownership only.

The function already demonstrates the right pattern for influence merits: it builds `expandedInfluence` by walking `m.benefit_grants` on standing merits (MCI). That same expansion does **not** apply to the `retainers`, `mentors`, `staff`, or `contacts` buckets — so any character holding those merits via a grant chain (e.g. Retainer via Attaché) gets no action surface.

Charlie Ballsack holds Retainer via the Attaché standing-merit grant chain. His DT form renders no Retainer action.

### Schema recap

- Standing merit: has `benefit_grants: [{ name, category, ... }]`
- Child merit in `c.merits[]`: has `granted_by: 'Parent Name'`
- Both shapes must be walked — `c.merits[]` entries with `granted_by` are already present on the character; `benefit_grants` on standing merits is a secondary source for any grants that may not be denormalised onto the char yet.

### Files in scope

- `public/js/tabs/downtime-form.js` — `detectMerits()` function; extend retainer/mentor/staff/contacts bucket construction to mirror the `expandedInfluence` pattern
- `server/tests/` — regression fixture for a character with granted-merit shape

### Files NOT in scope

- `public/js/editor/mci.js` — MCI grant logic; do not touch
- The render functions for each merit section — detection only; rendering is correct once detection fires
- ADR-003 redesign stories — this fix lands as a standalone hotfix; the redesign preserves it

---

## Acceptance Criteria

**Given** Charlie Ballsack's character has Retainer in `c.merits[]` with `granted_by` set (or via a standing merit's `benefit_grants`)
**When** `detectMerits()` runs
**Then** `detectedMerits.retainers` is non-empty and his DT form renders a Retainer action section.

**Given** any character holding Mentor, Staff, or Contacts via a grant chain
**When** `detectMerits()` runs
**Then** the corresponding `detectedMerits.*` bucket is populated and the action surfaces.

**Given** a regent or lieutenant character
**When** `detectMerits()` runs
**Then** the implicit feeding-rights rule is unchanged — regent/lieutenant territory feeding is not double-listed as a Retainer action.

**Given** the regression fixture
**When** the test suite runs
**Then** a test passes asserting that a character with a granted Retainer (via a standing-merit `benefit_grants` chain) produces a non-empty `detectedMerits.retainers`.

---

## Implementation Notes

The `expandedInfluence` block already in `detectMerits()` is the pattern to follow:

```js
// Existing — influence merits expanded from MCI benefit_grants
const expandedInfluence = [...merits];
for (const m of merits) {
  if (m.category === 'standing' && Array.isArray(m.benefit_grants)) {
    for (const g of m.benefit_grants) {
      if (g.category === 'influence') expandedInfluence.push({ ...g, _from_mci: m.cult_name || m.name });
    }
  }
}
```

Apply the same to a new `expandedMerits` (or extend `expandedInfluence` to cover all categories). Then use `expandedMerits` for the retainer/mentor/staff/contacts bucket filters instead of the raw `merits` array.

The `granted_by` field on `c.merits[]` entries means the merit IS already denormalised onto the character — those entries are in `merits` already and will be picked up once the filter no longer relies on a field that excludes them. Verify whether the current filter has an explicit exclusion on `granted_by` entries, or whether it's simply that `benefit_grants`-only grants (not yet denormalised) are missing. Handle both cases.

---

## Test Plan

- Read `detectMerits()` in full before touching it — understand every bucket assignment
- Add a server-side unit test: construct a minimal character fixture with a standing merit whose `benefit_grants` includes `{ name: 'Retainer', category: 'general' }` and assert the detection result
- Browser smoke: load Charlie Ballsack's character in the DT form; confirm Retainer action renders

---

## Definition of Done

- [x] `detectMerits()` expanded to walk granted merits for retainer/mentor/staff/contacts buckets
- [x] Charlie Ballsack's DT form renders a Retainer action
- [x] Regression test added and passing
- [x] No existing DT form tests broken
- [ ] PR opened from `angelus/issue-45-retainer-granted-merit-detect` into `dev`

## Dev Agent Record

### Implementation Notes

Charlie Ballsack has no `Retainer` merit directly. He holds `Attaché (Resources)` — `category: 'influence'`, `name: 'Attaché (Resources)'`, `ghoul: true`. The detection filter was `name === 'Retainer'` which never matched.

Fix: two-part change to the `detectedMerits.retainers` line in `detectMerits()`:
1. Changed source from raw `merits` to `expandedInfluence` — covers any future case where a Retainer is sourced via a standing-merit `benefit_grants` chain.
2. Added `m.name?.startsWith('Attaché (')` to the name check — mirrors the identical pattern already in `sheet.js:900` ("Attachés are functionally Retainers per game-rule").

Regression test (`server/tests/detect-merits-retainer.test.js`): 6 pure-function unit tests covering plain Retainer, Attaché shape, benefit_grants chain, mixed shapes, and exclusion of non-retainer merits.

### Files Changed

- `public/js/tabs/downtime-form.js` — `detectMerits()` lines 239-243
- `server/tests/detect-merits-retainer.test.js` — new regression test (6 tests, all passing)
