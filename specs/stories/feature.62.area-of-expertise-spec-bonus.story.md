# Story feature.62: Area of Expertise — Correct Spec Bonus in Pool Builder

## Status: draft

## Story

**As an** ST processing downtime actions,
**I want** Area of Expertise specs to show and save as +2 in the pool builder,
**so that** the dice pool I build and roll from correctly reflects the merit's benefit.

## Background

The merit "Area of Expertise" (qualifier = spec name) grants +2 dice for that specialisation instead of the normal +1. `hasAoE(c, specName)` already exists in `helpers.js` and correctly identifies this on a character.

The gap is entirely in the admin pool builder:

- Spec toggle labels always read `"Coward Punch +1"` regardless of AoE.
- The change handler saves `pool_mod_spec: activeFeedSpecs.length` — a plain count — so an AoE spec contributes 1 die, not 2.
- At roll time, `pool.total + specBonus` uses this saved count, so the rolled pool is one die short whenever an AoE spec is active.

The player downtime form and the suite roll calculator already compute AoE correctly. Only the admin panel is broken.

## Acceptance Criteria

1. Each spec toggle label displays "+2" when `hasAoE(char, spec)` is true for that spec, "+1" otherwise.
2. When the ST checks or unchecks a spec toggle, `pool_mod_spec` is saved as the **sum** of individual bonuses — 2 for each AoE spec, 1 for each regular spec — not a plain count.
3. The correct bonus displays at initial panel render (not just after a skill change).
4. Both feeding entries and project entries are fixed.

## Tasks / Subtasks

- [ ] Task 1: Import `hasAoE` in `downtime-views.js`
  - [ ] Add `hasAoE` to the import from `../data/helpers.js`

- [ ] Task 2: Fix spec toggle label render in `_updateFeedBuilderMeta`
  - [ ] For each spec in the loop, compute `const aoe = hasAoE(char, sp)` and render `+2` or `+1` in the label text

- [ ] Task 3: Fix spec toggle label render at initial project entry render
  - [ ] In the project builder block (`else if (entry.source === 'project')`), same label fix using `projChar`

- [ ] Task 4: Fix `pool_mod_spec` calculation in `dt-feed-spec-toggle` change handler
  - [ ] After updating `activeFeedSpecs`, look up `char` for the entry (via `submissions` + `characters`)
  - [ ] Compute `const specBonus = activeFeedSpecs.reduce((sum, sp) => sum + (hasAoE(char, sp) ? 2 : 1), 0)`
  - [ ] Save `pool_mod_spec: specBonus` instead of `activeFeedSpecs.length`

## Dev Notes

### `hasAoE` signature
```javascript
export function hasAoE(c, specName) {
  return (c.merits || []).some(m =>
    m.name?.toLowerCase() === 'area of expertise' && m.qualifier?.toLowerCase() === specName.toLowerCase()
  );
}
```
Already exported from `public/js/data/helpers.js`.

### Getting `char` in the toggle handler
The toggle handler currently only has `entry` and `review`. To get char:
```javascript
const sub = submissions.find(s => s._id === entry.subId);
const char = sub
  ? (characters.find(c => String(c._id) === String(sub.character_id)) || charMap.get((sub.character_name || '').toLowerCase().trim()))
  : null;
```
`characters` is a module-level array. Characters are already processed through `applyDerivedMerits` by `loadCharacters()`, so no extra processing needed.

### `pool_mod_spec` vs `active_feed_specs`
`active_feed_specs` stays as an array of spec names. `pool_mod_spec` changes from a count to a summed bonus. Any consumer of `pool_mod_spec` that treats it as a number should continue to work unchanged.

### Where spec renders happen
| Location | Where |
|----------|-------|
| Skill change → feeding | `_updateFeedBuilderMeta`, the spec loop (~line 3881) |
| Initial render → project | `renderActionPanel` project block, the `_pSp` loop (~line 4578) |
| Change handler | `dt-feed-spec-toggle` listener (~line 3270) |

### Key files

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | Import `hasAoE`; fix spec label render (2 locations); fix change handler |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-13 | 1.0 | Initial draft | Angelus |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
- `public/js/admin/downtime-views.js`
- `specs/stories/feature.62.area-of-expertise-spec-bonus.story.md`
