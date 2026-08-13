# Story feature.1154: EQC-3 — Container Assignment (Write Path + Picker UI)

## Status: review

---
issue: 1154
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/1154
branch: ms/issue-1154-eqc3-container-assignment
depends_on: ms/issue-1153-eqc2-onme-elsewhere-display (EQC-2, #1153) — branched from ITS tip
  (which itself stacks on EQC-1, #1152). Same disclosed deviation from "branch from main" as EQC-2,
  same reason: this story is the FIRST real reader/writer of `container_id`, introduced by EQC-1.
---

## Story

**As a** Storyteller adding equipment to a character,
**I want** to place a newly-added item inside one of the character's own container-bucket items (a
haven, a vehicle, a safe) at the moment I add it, with the server actually validating that reference,
**so that** `container_id` — inert since EQC-1 introduced it — becomes real, usable data instead of a
field nothing ever sets or checks.

## Background

Epic #1038 item 4 / issue #1154's own text: *"ST CRUD interface for equipment so STs can create
arbitrary items (extends existing equipment_catalogue admin)... place equipment inside a container
asset."* Two genuinely different things share this one sentence:

1. **"Create arbitrary items" = catalogue CRUD.** Already fully done by EQC-1 —
   `equipment-catalogue-admin.js`'s `BUCKETS`/`BUCKET_FIELDS` already cover all five bucket values
   including `container`. Nothing left to build here.
2. **"Place equipment inside a container asset" = assigning `container_id` on a CHARACTER's owned
   equipment row.** This is genuinely unbuilt. EQC-1 introduced the `container_id` schema field with
   an explicit, disclosed gap: *"NOT VALIDATED AS A REFERENCE ANYWHERE YET... Whoever builds the first
   `container_id` consumer MUST add real validation at that point."* This story is that consumer.

**Investigation finding, this session**: `POST /api/characters/:id/equipment` (the only write path for
adding a character's equipment) doesn't even ACCEPT `container_id` today — its `cleanItem` allowlist
is `{catalogue_id, state, acquired_cycle, notes}` only. A client sending `container_id` today has it
silently dropped, not merely unvalidated.

**Scope decision (documented here, not asked again)**: there is no PATCH/edit endpoint for an
EXISTING equipment row — only add (POST) and remove (DELETE). So "place inside a container" is scoped
to **assignment at add-time only**. Re-assigning (or un-assigning) an already-added item's container is
real future work with no existing endpoint to hang it off — out of scope here, not silently dropped
(see "Explicitly NOT this story").

## Explicitly NOT this story

- **No edit/reassignment of an EXISTING equipment row's `container_id`.** Only settable at the moment
  a new item is added via `POST /:id/equipment`. Changing an already-owned item's container, or moving
  it out of one, needs a PATCH endpoint this story does not build.
- **The container-instance-identity ambiguity is NOT resolved.** EQC-1's review already found and
  deferred this: `container_id` keys off `catalogue_id`, so two identical containers (e.g. two
  haven-type catalogue entries a character somehow owns twice) are indistinguishable as targets. This
  story's write validation accepts "does ANY of the character's own equipment rows have this
  catalogue_id, and is that catalogue item's bucket `container`" — genuinely ambiguous under
  duplicates, same as before. Fixing this means changing the reference shape (array-index-based
  instead of catalogue_id-based), a real design decision out of scope here.
- **No cascade/orphan handling when a container item is itself removed** (`DELETE
  /:id/equipment/:itemIndex`) while other items reference it. Contained items become dangling
  references, which is exactly the "unresolvable container_id renders as loose" contract EQC-1's own
  schema comment already establishes as acceptable, display-side. This story does not add a
  delete-time guard (e.g. blocking removal of a non-empty container) — that's a real product question
  (should an ST be blocked from removing a container that still holds things?) for a future story.
- **No visual "contents of X" grouped view.** Contained items render inline in their own bucket
  section same as before, with a small "(in: <container name>)" annotation — not nested/indented under
  their container. A real containment-aware layout is future UI work.
- **No change to catalogue-level (`equipment_catalogue`) CRUD** — already done, EQC-1.

## Acceptance Criteria

1. `POST /api/characters/:id/equipment` accepts an optional `container_id` in the request body.
   - `null`/absent: unchanged behaviour (loose item, as today).
   - Present: must be a 24-hex ObjectId string. `400 VALIDATION_ERROR` otherwise.
   - Must reference a `catalogue_id` that appears on ANOTHER equipment row this SAME character already
     owns (before this new item is added). `400 VALIDATION_ERROR` if no such row exists (fails
     BEFORE the write — the whole request is rejected, not a partial write).
   - That referenced `catalogue_id` must resolve to an `equipment_catalogue` document whose `bucket`
     is `container`. `400 VALIDATION_ERROR` otherwise.
   - On success, the stored equipment row includes `container_id` (coerced to a string on the wire,
     matching `catalogue_id`'s own existing wire/disk convention — no need to hydrate to ObjectId on
     disk, since the schema itself types it as a string pattern field, unlike `catalogue_id`).
2. `editor/sheet.js`'s "Add Equipment Item" form gains a "Place inside" dropdown, populated with the
   character's own current container-bucket equipment rows (name + catalogue_id). Shows "— none —" /
   no selection as the default (loose item, unchanged default behaviour). The dropdown does not offer
   the item currently being added as its own container target (moot for a brand-new add, but the
   dropdown's option list is explicitly sourced from EXISTING container rows only, never from the
   in-progress add itself).
3. `shAddEquip()` (`editor/edit.js`) includes `container_id` in the POST body when the dropdown has a
   selection, `null` otherwise.
4. Sheet display: a contained item's row shows "(in: <container name>)" as part of its existing
   `trait-sub` qual line (alongside availability / on-me-elsewhere / other stats). **Resolution found
   during dev, stronger than the AC as originally written**: "dangling" must mean "the character no
   longer owns a row with this catalogue_id" (i.e. they removed the container from their own
   equipment[]), NOT merely "the catalogue_id doesn't globally exist in equipment_catalogue" — the
   catalogue-admin delete guard only blocks deleting a catalogue item while ANY character holds it via
   `equipment.catalogue_id`, it has no awareness of `container_id` references at all, so the global
   catalogue item can easily still exist after a specific character's own container row is removed. A
   dangling reference (by the correct, character-scoped definition) renders as loose — no error, no
   "(in: undefined)" — per EQC-1's own "display-inert" contract, now actually correct rather than only
   correct in the common case.
5. `npm test`: every equipment-related suite green; no new failures beyond the established
   pre-existing baseline.
6. TM Wiki, TM Cockpit, and TM Herald are completely untouched — TM Suite-only.

## Tasks / Subtasks

- [x] **Task 1 — Write-path validation** (AC #1)
  - [x] `server/routes/characters.js`: `POST /:id/equipment` — accept + validate `container_id`.
  - [x] Vitest coverage: valid container_id, malformed hex, dangling reference, non-container target,
        null/absent (unchanged behaviour), two-independent-containers, full regression on
        equipment.test.js.

- [x] **Task 2 — Add-form picker** (AC #2, #3)
  - [x] `editor/sheet.js`: new "Place inside" `<select>` in the add-equipment form, sourced from
        `byBucket.container` (already computed in `shRenderEquipment`). Only rendered when the
        character owns at least one container (no empty no-op dropdown).
  - [x] `editor/edit.js`: `shAddEquip()` reads the new field, includes `container_id` in the POST body.

- [x] **Task 3 — Display** (AC #4)
  - [x] `equipmentContainerLabel` extracted as a pure, exported function in `equipment-derivation.js`
        (not a closure in sheet.js) — checks character-owned status, not just catalogue existence, per
        AC #4's dev-time resolution.
  - [x] Sheet renderer wired into all 6 non-Container render sections.
  - [x] Tests proving resolved, character-scoped-dangling, catalogue-scoped-dangling, and
        self-reference cases; prove-discriminated.

- [x] **Task 4 — Full regression** (AC #5, #6)
  - [x] Every equipment-related vitest suite green (9 files, 196/196).
  - [x] Confirm zero diff under TM Wiki, TM Cockpit, TM Herald.

## Dev Notes

- The validation order in AC #1 matters: malformed shape first, then existence (does the character
  already own a row with this catalogue_id), then bucket-correctness (is that catalogue item a
  container) — same "fail early, cheapest check first" discipline as the existing `catalogue_id`
  checks immediately above where this new logic slots in.
- `container_id` is a STRING field on the wire and on disk per its own schema definition (`type:
  ['string', 'null'], pattern: '^[a-f0-9]{24}$'`) — unlike `catalogue_id`, which the schema also types
  as a wire string but the route coerces to an ObjectId before `$set`. Do NOT apply that same
  ObjectId-coercion to `container_id` — it is deliberately NOT an ObjectId reference type in the
  schema (it's validated by pattern only), so storing it as the plain string keeps read-site
  string-comparison (`e.catalogue_id === containerId`) working without a type-mismatch trap.

### Project Structure Notes

- Modified: `server/routes/characters.js`, `public/js/editor/sheet.js`, `public/js/editor/edit.js`,
  plus new/extended test coverage (likely `server/tests/equipment.test.js` for the write-path
  validation, given that's where the existing `POST /:id/equipment` tests already live).
- No schema changes — `container_id` already exists from EQC-1.

### References

- Epic EQC, issue #1038, desired-behaviour item 4.
- `specs/stories/feature.1152.eqc1-bucket-container-schema.story.md` — where `container_id` was
  introduced, and its own explicit "whoever builds the first consumer must add validation" note.
- `specs/deferred-work.md`, "Deferred from: EQC-1" section — the container-instance-identity gap this
  story does not resolve.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5.

### Debug Log References

- Built in a dedicated `git worktree` (`D:\Terra Mortis\TM Suite-eqc`, branch
  `ms/issue-1154-eqc3-container-assignment`) rather than the shared `D:\Terra Mortis\TM Suite`
  directory, adopted this session after a real branch-checkout collision with a concurrent session
  doing unrelated Epic OXP work in the same directory. `node_modules` (root + `server/`) junctioned
  from the original checkout (read-only reuse, no reinstall); `server/.env` copied (gitignored, not
  carried by git or the junction).
- Found during Task 3 that the AC's original "dangling = catalogue_id doesn't exist" definition was
  wrong: the catalogue-admin DELETE guard only blocks removing a catalogue item while some
  character's `equipment.catalogue_id` still references it - it has no knowledge of `container_id`
  references. So a character could remove their OWN container row (freeing the catalogue item to be
  deleted by an ST, or just leaving it globally intact for other characters) while their OTHER items'
  `container_id` still pointed at that now-not-owned catalogue_id - the original AC's check would have
  kept showing "(in: X)" for a container this specific character no longer owns. Fixed by checking
  the character's OWN equipment array for continued ownership, not the global catalogue. AC #4 amended
  to record this in place rather than only in a completion note.

### Completion Notes List

- Write-path validation follows the story's own specified order (shape -> existence -> bucket-
  correctness) and reuses the exact same 24-hex-ObjectId shape check `catalogue_id` already used, for
  consistency.
- `container_id` stored as a plain string (not ObjectId-coerced), matching its own schema type -
  verified this doesn't create a mismatch against `String(e.catalogue_id) === item.container_id`
  read-site comparisons (both sides are strings).
- The "Place inside" dropdown only renders when the character owns at least one container - avoids an
  always-present, usually-empty, confusing no-op affordance.
- `equipmentContainerLabel` extracted as a pure function (not a sheet.js closure), matching the
  pattern already established for `isCombatGearArmourShaped`/`isCombatGearWeaponShaped`/
  `isEquipmentOnMe`/`equipmentLocationLabel` - every one of EQC's display predicates now lives in
  `equipment-derivation.js`, directly unit-testable, none embedded inline.
- Full equipment suite: 9 files, 196/196 (up from EQC-2's 185 - this story's own 11 new tests: 6 in
  `equipment.test.js` for the write path, 5 in `issue-879-defence-penalty-wirein.test.js` for
  `equipmentContainerLabel`).
- Prove-discriminated the one behaviourally-critical piece of new logic (the character-ownership
  check in `equipmentContainerLabel`) - temporarily hardcoded it to always-true, confirmed exactly the
  2 tests that depend on it failed (dangling-reference and self-reference cases), restored.
- The container-instance-identity ambiguity (two identical containers indistinguishable by
  catalogue_id) remains exactly as deferred by EQC-1 - this story's write-path existence check
  inherits the same "does ANY row have this catalogue_id" limitation, disclosed again here rather than
  silently accepted.

### File List

- `server/routes/characters.js` (modified - `POST /:id/equipment` container_id validation)
- `server/tests/equipment.test.js` (modified - 2 new catalogue fixtures + 6 new tests)
- `public/js/data/equipment-derivation.js` (modified - new `equipmentContainerLabel` export)
- `public/js/editor/sheet.js` (modified - "Place inside" picker, `containedLabel` wired into 6 sections)
- `public/js/editor/edit.js` (modified - `shAddEquip()` sends `container_id`)
- `server/tests/issue-879-defence-penalty-wirein.test.js` (modified - new `#1154 EQC-3` describe block)
