# Story feature.63: Interdisciplinary Specialty — Cross-Skill Spec in Pool Builder

## Status: done

## Story

**As an** ST processing downtime actions,
**I want** Interdisciplinary Specialty specs to appear as toggle options for any skill in the pool builder,
**so that** I can apply a character's cross-skill specialisation correctly when building a pool.

## Background

The merit "Interdisciplinary Specialty" (qualifier = spec name) allows a named specialisation — normally attached to one skill — to be applied to any skill roll.

Currently, spec toggles are built solely from `skSpecs(char, selectedSkill)`. A spec stored under Crafts (e.g., "Coward Punch") never appears when Weaponry is the selected skill, even though IS grants it universally.

As of today no code checks for IS anywhere in pool-building logic — it is a completely inert merit label.

## Acceptance Criteria

1. A new helper `isSpecs(char)` returns an array of `{ spec, fromSkill }` objects for every Interdisciplinary Specialty merit on the character. `fromSkill` is the skill whose `specs` array contains the spec (found by searching all character skills).
2. In the admin pool builder, when spec toggles are rendered for any selected skill, IS-granted specs are appended after the skill-native specs. Each IS toggle is labelled `"Coward Punch (Crafts) +1"` (or `+2` if also AoE) to distinguish it from a native spec.
3. IS spec toggles use the same `dt-feed-spec-toggle` class and `data-spec` attribute (spec name only, not "Spec (Skill)") so the existing change handler saves them to `active_feed_specs` and accumulates their bonus correctly (feature.62 handles the AoE case).
4. IS spec toggles appear in both the feeding and project pool builders.
5. An IS spec that is also AoE (`hasAoE(char, spec)`) displays "+2" following the same rule as feature.62.

## Out of Scope

- Player downtime form spec display (player form does not drive adjudication rolls)
- Storing `fromSkill` in the saved review — only the spec name matters for `pool_mod_spec`

## Tasks / Subtasks

- [x] Task 1: Add `isSpecs(char)` helper in `helpers.js`
  - [x] Iterate `(c.merits || [])` for entries where `m.name?.toLowerCase() === 'interdisciplinary specialty'`
  - [x] For each, find `fromSkill` by searching `Object.entries(c.skills || {})` for the skill whose `specs` array contains the qualifier (case-insensitive)
  - [x] Return `[{ spec: m.qualifier, fromSkill }, ...]`; skip entries where qualifier is empty or no matching skill found
  - [x] Export from `helpers.js`

- [x] Task 2: Import `isSpecs` in `downtime-views.js`
  - [x] Add to existing `helpers.js` import line

- [x] Task 3: Append IS toggles in `_updateFeedBuilderMeta`
  - [x] After the existing spec loop, call `isSpecs(char)` and loop over results
  - [x] For each IS spec, render an additional `dt-feed-spec-toggle` label: `"${spec} (${fromSkill}) +1/+2"`
  - [x] Check `active_feed_specs` for existing checked state same as native specs

- [x] Task 4: Append IS toggles at initial project entry render
  - [x] After the `_pSp` loop in the project builder block, add the same IS spec loop using `projChar`

## Dev Notes

### `isSpecs` implementation sketch
```javascript
export function isSpecs(c) {
  const results = [];
  for (const m of (c.merits || [])) {
    if (m.name?.toLowerCase() !== 'interdisciplinary specialty') continue;
    const q = m.qualifier || '';
    if (!q) continue;
    let fromSkill = null;
    for (const [skillName, so] of Object.entries(c.skills || {})) {
      if ((so.specs || []).some(s => s.toLowerCase() === q.toLowerCase())) {
        fromSkill = skillName;
        break;
      }
    }
    if (fromSkill) results.push({ spec: q, fromSkill });
  }
  return results;
}
```

### data-spec value
`data-spec` stores only the raw spec name (e.g. `"Coward Punch"`), not `"Coward Punch (Crafts)"`. The display label carries the source skill context; the saved value stays clean for `active_feed_specs` lookups and `hasAoE` matching.

### Interaction with feature.62
IS specs participate in the AoE bonus check unchanged — `hasAoE(char, 'Coward Punch')` returns true if the character also has Area of Expertise (Coward Punch). No extra logic needed here.

### Key files

| File | Change |
|------|--------|
| `public/js/data/helpers.js` | Add and export `isSpecs(c)` |
| `public/js/admin/downtime-views.js` | Import `isSpecs`; append IS toggles in `_updateFeedBuilderMeta` and project initial render |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-13 | 1.0 | Initial draft | Angelus |
| 2026-04-13 | 1.1 | Implemented — isSpecs helper + IS toggles at all four render sites | Claude Sonnet 4.6 |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References

### Completion Notes List
- `isSpecs(c)` added to `helpers.js` after `hasAoE` — resolves qualifier back to its source skill via case-insensitive spec search; returns `[]` cleanly if char is null/empty
- IS toggles appended at all four render sites: `_updateFeedBuilderMeta` project path, `_updateFeedBuilderMeta` feeding path, feeding initial render in `renderActionPanel`, project initial render in `renderActionPanel`
- IS labels show "Spec (SourceSkill) +1/+2" — `data-spec` stores raw spec name only so existing change handler and AoE bonus calc (`hasAoE`) work without modification
- `char || {}` guard used in the two initial-render sites where `char` may be null; the two `_updateFeedBuilderMeta` paths already guard `char` before calling the function

### File List
- `public/js/data/helpers.js`
- `public/js/admin/downtime-views.js`
- `specs/stories/feature.63.interdisciplinary-specialty.story.md`
