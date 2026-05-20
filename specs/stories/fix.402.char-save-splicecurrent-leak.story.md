# Story fix.402: Character save fails — spliceCurrent writes c.current into PUT payload

**Story ID:** fix.402
**Status:** review
**Date:** 2026-05-19
**Issue:** [#402](https://github.com/angelusvmorningstar/TerraMortis/issues/402)
**Branch:** ms/issue-402-char-save-splicecurrent-leak

---

## User Story

As an ST using the Admin character editor,
I want character saves to succeed after viewing a sheet,
so that I don't lose edits to a 400 validation error.

---

## Background

Epic STM (PRs #385-#390) introduced `spliceCurrent(c, tracker)` in
`public/js/data/st-mods.js`. It writes a synthetic `c.current` object onto the
in-memory character at every non-edit `renderSheetWithOverlay` call:

```
c.current = {
  damage_bashing, damage_lethal, damage_aggravated, willpower, vitae
}
```

ADR-004 §D6 states the overlay is read-direction only and must never reach the
write path. `_st_mod_overlay` and `_st_mod_base` satisfy this by having `_`
prefixes — `buildSaveBody` strips all `_`-prefixed keys. `current` has no
underscore, so it survives into the PUT body. The character schema has
`additionalProperties: false`, causing every save to fail with:

```
PUT /api/characters/:id → 400
{ "path": "(root)", "message": "must NOT have additional properties", "property": "current" }
```

The bug affects every character save in the Admin app: `c.current` is present on
any character whose sheet was rendered before the save (i.e. always).

---

## Acceptance Criteria

- [x] Given any character sheet has been rendered (`spliceCurrent` called), when an ST
      saves via the Admin sheet editor, the PUT request body does not contain a `current`
      property at root level.
- [x] Character saves that were failing with "must NOT have additional properties" succeed.
- [x] `c.current` continues to be populated by `spliceCurrent` at render time — tracker
      state display (damage tracks, vitae, willpower) is unaffected.
- [x] No regression: `_st_mod_overlay` and `_st_mod_base` continue to be stripped.

---

## Implementation

### Pre-flight: merge origin/dev

`st-mods.js` is on `dev` (STM epic), not on `Morningstar`. Merge before starting:

```bash
git merge origin/dev
```

Resolve `sprint-status.yaml` conflicts by keeping all entries from both sides.

---

### Change — `public/js/admin.js` · `buildSaveBody` (line ~892)

**Current** (on dev):

```js
const _LEGACY_FIELDS = new Set(['attr_creation', 'skill_creation', 'disc_creation', 'merit_creation']);

function buildSaveBody(c) {
  // Strip _id (goes in URL), all ephemeral _-prefixed runtime fields, and legacy v2 fields
  const body = {};
  for (const [k, v] of Object.entries(c)) {
    if (k === '_id' || k.startsWith('_') || _LEGACY_FIELDS.has(k)) continue;
    body[k] = v;
  }
  return body;
}
```

**New** — add `k === 'current'` to the skip condition:

```js
const _LEGACY_FIELDS = new Set(['attr_creation', 'skill_creation', 'disc_creation', 'merit_creation']);

function buildSaveBody(c) {
  // Strip _id (goes in URL), all ephemeral _-prefixed runtime fields, legacy v2 fields,
  // and c.current (tracker-state namespace written by spliceCurrent — not a schema field).
  const body = {};
  for (const [k, v] of Object.entries(c)) {
    if (k === '_id' || k.startsWith('_') || k === 'current' || _LEGACY_FIELDS.has(k)) continue;
    body[k] = v;
  }
  return body;
}
```

That is the only code change. One condition added to a single loop.

---

### Why not rename c.current → c._current?

Six files on `dev` read `c.current.*`:
- `public/js/admin.js`
- `public/js/data/st-mod-labels.js`
- `public/js/data/st-mod-popover-spec.js`
- `public/js/editor/sheet.js`
- `public/js/editor/st-mod-popover.js`
- `public/js/player.js`

Plus server tests reference the shape. For a production-blocking regression, the
one-liner in `buildSaveBody` is strictly safer. The rename is a valid future
refactor but out of scope here.

---

## Dev Notes

### Call sequence in admin.js

```
renderSheetWithOverlay(c):
  if editMode:
    stripOverlay(c)         ← removes _st_mod_overlay and _st_mod_base only
    renderSheet(c)          ← c.current still present from prior non-edit render
    return

  tracker = loadTrackerState(c)
  spliceCurrent(c, tracker) ← sets c.current = { damage_bashing, damage_lethal,
                                damage_aggravated, willpower, vitae }
  mods = loadStMods(c._id)
  applyStMods(c, mods, overlayEnabled)
  renderSheet(c)
```

`c.current` is therefore present on the character object after any non-edit render.
`stripOverlay` does NOT clear it. `buildSaveBody` must skip it.

### What the schema allows

`server/schemas/character.schema.js` has `additionalProperties: false`. `current`
is not in the schema. Adding it there would be wrong — it is tracker state, not a
character property.

### Why c.current leaks through edit mode too

In edit mode, `stripOverlay` is called but not `spliceCurrent`. However if the user
rendered the sheet in non-edit mode first (the normal flow), `c.current` was already
written and sits on the object. There is no cleanup between render and save.

### No schema changes needed

The fix is entirely in the client. No API, no server schema, no CSS changes.

---

## Testing

Write a new Vitest mirror-test at `server/tests/fix.402.spliceCurrentLeak.test.js`
using the project's mirror-test pattern (inline the pure logic, no DOM).

Tests to cover:

- **AC1** — `buildSaveBody` with `c.current` set → returned body has no `current` key
- **AC2** — `buildSaveBody` without `c.current` set → returned body unchanged
- **AC3** — `buildSaveBody` strips `_st_mod_overlay` and `_st_mod_base` (regression guard)
- **AC4** — `buildSaveBody` strips `_id` and `_`-prefixed keys (existing behaviour)
- **AC5** — `buildSaveBody` strips legacy creation fields (`attr_creation`, etc.)
- **AC6** — A character with `c.current` set and other canonical fields → only canonical
            fields survive, `current` does not

The mirror test inlines `buildSaveBody` logic directly in the test file — no import of
browser JS modules required. This matches the pattern used in
`server/tests/fix.400.phantom-merit-rows.test.js`.

---

## Files to Change

| File | Change |
|---|---|
| `public/js/admin.js` | `buildSaveBody`: add `|| k === 'current'` to the skip condition |
| `server/tests/fix.402.spliceCurrentLeak.test.js` | New — 6 Vitest mirror-tests |

No other files change. No schema changes. No API changes.

---

## Dev Agent Record

### Files Changed

- `public/js/admin.js` — `buildSaveBody`: added `|| k === 'current'` to the skip condition
- `server/tests/fix.402.spliceCurrentLeak.test.js` — 12 new Vitest mirror-tests (6 describe blocks)

### Completion Notes

Single-line fix in `buildSaveBody`. Added `k === 'current'` to the skip condition alongside
`_id`, `_`-prefixed, and `_LEGACY_FIELDS` exclusions. `c.current` is now stripped before
every PUT, matching the intended ADR-004 §D6 read-only contract.

Pre-flight merge of `origin/dev` was required (st-mods.js absent from Morningstar).

12 Vitest mirror-tests pass. 67 related regression tests (character CRUD + ST mods API) pass.
0 regressions.
