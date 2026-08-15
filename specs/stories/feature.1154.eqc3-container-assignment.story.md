# Story feature.1154: EQC-3 — Container Assignment (Write Path + Picker UI)

## Status: done

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

**Investigation finding, this session**: `POST /api/characters/:id/equipment` doesn't even ACCEPT
`container_id` today — its `cleanItem` allowlist is `{catalogue_id, state, acquired_cycle, notes}`
only. A client sending `container_id` today has it silently dropped, not merely unvalidated.

**Correction (Codex external review Medium finding, applied during this story, not deferred)**: the
above investigation's claim that `POST /:id/equipment` is "the only write path for adding a
character's equipment" was FALSE, and the first version of this story built container_id validation
only there. `PUT /api/characters/:id` (the main admin Save-to-DB path — `public/js/admin.js`'s
`buildSaveBody()` submits the character's COMPLETE `equipment[]` array through it on every normal
save) and the two character-create routes (`POST /wizard`, `POST /`) all accept a full `equipment[]`
array with ZERO container_id validation of their own. This meant enforcement depended entirely on
which endpoint a caller used — invalid containment rejected by the single-item endpoint could be
persisted wholesale through the character's own main save flow. Fixed by extracting ONE shared
validator (`validateEquipmentContainerRefs`) all four write paths now call — see AC #1's amendment.

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
- **`state: 'lost'` containers remain selectable and continue to count as "owned" for validation
  purposes** (Codex external review Low finding, dispositioned during this story, not deferred
  silently). "Owns" is defined structurally — does a row with this catalogue_id exist in the
  character's own `equipment[]` — not by possession state. A lost haven (misplaced, not removed) can
  still coherently hold items in the fiction ("my keys are in my lost satchel"); the write path and
  display both treat row presence, not `state`, as the ownership signal. Deliberate, not an oversight
  — changing this would be a real product-rules question (should a lost container's contents also
  become "lost"?) that this story does not answer.

## Acceptance Criteria

1. **Amended (Codex external review Medium finding)**: EVERY write path that can set a character's
   `equipment[]` array — `POST /:id/equipment`, `PUT /:id`, `POST /wizard`, and `POST /` (ST
   character-create) — validates `container_id` via one shared function
   (`validateEquipmentContainerRefs`), not four independent copies. For each item carrying a
   `container_id`:
   - `null`/absent: unchanged behaviour (loose item, as today).
   - Present: must be a 24-hex ObjectId string. `400 VALIDATION_ERROR` otherwise.
   - Must reference a `catalogue_id` that appears on ANOTHER equipment row in the same candidate array
     (existing rows + the new item, for the single-item endpoint; the submitted array as-is, for the
     full-replace/create endpoints). `400 VALIDATION_ERROR` if no such row exists — fails BEFORE any
     write, the whole request is rejected, never a partial write.
   - That referenced `catalogue_id` must resolve to an `equipment_catalogue` document whose `bucket`
     is `container`. `400 VALIDATION_ERROR` otherwise.
   - **Single-level containment, now actually enforced** (the first version of this story documented
     the rule but never checked it): the referenced container row must NOT itself already carry a
     `container_id`. `400 VALIDATION_ERROR` otherwise — a container that is itself contained cannot
     hold further items.
   - On success, the stored equipment row includes `container_id` (a plain string, not ObjectId-
     coerced — matches its own schema type, unlike `catalogue_id`).
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
   **Amended twice more, Codex external review Medium findings**: (a) the first version rendered the
   bare text `in: Haven`, missing this AC's own literal parentheses — fixed to `(in: Haven)`; (b) the
   label was wired into six of the seven equipment-render sections, omitting the Containers section
   itself — meaning a container placed inside ANOTHER container (a Safe inside a Haven, exactly the
   epic's own worked example) stored correctly but rendered with no visible indication of the nesting.
   Fixed by wiring the same label into all seven sections.
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
  - [x] Sheet renderer wired into ALL SEVEN render sections including Containers itself (review patch
        — a container can be contained inside another container).
  - [x] "(in: X)" parenthesised form, matching AC #4's literal text (review patch).
  - [x] Tests proving resolved, character-scoped-dangling, catalogue-scoped-dangling, self-reference,
        and the parenthesised-text cases; prove-discriminated.

- [x] **Task 4 — Full regression** (AC #5, #6)
  - [x] Every equipment-related vitest suite green (9 files, 204/204 post-review-patch).
  - [x] Confirm zero diff under TM Wiki, TM Cockpit, TM Herald.

- [x] **Task 5 — Review patch: validation on every equipment-write path** (AC #1 amendment, Codex
      external review Medium finding)
  - [x] Extracted `validateEquipmentContainerRefs` as one shared validator.
  - [x] Wired into `POST /:id/equipment` (replacing its own inline duplicate logic), `PUT /:id`,
        `POST /wizard`, `POST /`.
  - [x] Single-level containment now actually enforced (a container_id target must not itself be
        contained) — previously documented but never checked.
  - [x] Tests for all four write paths, including the single-level rejection case; prove-discriminated
        (both the single-level check and the PUT-route wiring specifically).

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

- `server/routes/characters.js` (modified - `validateEquipmentContainerRefs` shared validator, wired
  into `POST /:id/equipment`, `PUT /:id`, `POST /wizard`, `POST /`)
- `server/tests/equipment.test.js` (modified - 2 new catalogue fixtures + 15 new tests across POST/PUT/create)
- `public/js/data/equipment-derivation.js` (modified - `equipmentContainerLabel` export, `(in: X)` format)
- `public/js/editor/sheet.js` (modified - "Place inside" picker, `containedLabel` wired into all 7 sections)
- `public/js/editor/edit.js` (modified - `shAddEquip()` sends `container_id`)
- `server/tests/issue-879-defence-penalty-wirein.test.js` (modified - `#1154 EQC-3` describe blocks + wiring check)

## Senior Developer Review (AI)

**Reviewer**: Codex (external, CLI-direct via `codex exec`, `model_reasoning_effort=high`), invoked through the `codex-review` skill under `bmad-loop`, sandboxed to this dedicated worktree (`D:\Terra Mortis\TM Suite-eqc`) with explicit instructions never to touch the sibling `TM Suite` directory a concurrent session was using. Full prompt at `specs/stories/code-review/issue-1154-eqc3-codex-review.md`, full findings at `specs/stories/code-review/issue-1154-eqc3-codex-findings.md`.

**Method**: 3-pass single-session review against the committed diff (base `f13c21cb`, head `de5d5278`), scoped to the 6 touched source/test files.

**Ship assessment (Codex's own words)**: *"Needs patches before shipping. There is no blocking/High problem... The literal AC #4 display defects and inconsistent validation through full-character writes are Medium findings and should be fixed before acceptance."* All patched and verified before this story moved to `done`.

### Findings and disposition

- **[Medium, Pass 1] Uppercase 24-hex `container_id` rejected.** Pass 2 (same review, same session) independently checked `character.schema.js`'s own field pattern (`^[a-f0-9]{24}$`, lowercase only) and found the route's behaviour is CONSISTENT with the schema's real contract - the Pass 1 finding was a false positive, self-corrected by the review's own later pass. **NO ACTION** - already correctly resolved within the review itself.
- **[Medium, Pass 2 + Pass 3a] Full-character write paths (`PUT /:id`, `POST /wizard`, `POST /`) bypassed container_id validation entirely.** VERIFIED TRUE and the most significant finding of this pass - `PUT /:id` is literally the main admin Save-to-DB path (`public/js/admin.js`'s `buildSaveBody()` submits the whole `equipment[]` array through it on every normal save), and it had zero container awareness. **PATCHED**: extracted `validateEquipmentContainerRefs` as one shared validator; wired into all four equipment-array write paths. Also closed a gap the original design never checked at all: single-level containment (a container_id target must not itself be contained) is now actually enforced, not just documented.
- **[Medium, Pass 2 + Pass 3a] A container placed inside another container was stored correctly but invisible in the UI** (the Containers section never called `containedLabel`). VERIFIED TRUE. **PATCHED**: wired into all seven render sections, not six.
- **[Medium, Pass 3a] AC #4's literal parenthesised text ("(in: X)") was violated** - the implementation rendered the bare `in: X`. VERIFIED TRUE. **PATCHED**.
- **[Medium, Pass 3a] The story's Background claimed `POST /:id/equipment` was "the only write path for adding a character's equipment"** - false, and the false premise is WHY the validation-bypass finding above was possible. **PATCHED**: Background corrected in place, AC #1 amended to name all four write paths explicitly.
- **[Low, Pass 1] Self-reference guard relies on object identity; the one test only exercises the favourable case.** Pass 2 (same review) traced the actual production call site and confirmed the current renderer always passes the same object reference, so this is not currently reachable - flagged as "brittle for future callers" only. **NO ACTION** - documented as a known limitation in the function's own comment (already present); not exploitable today.
- **[Low, Pass 2] "Lost" containers remain selectable and count as owned regardless of state.** VERIFIED TRUE, and the review itself flagged this as a genuine design ambiguity ("the story may define 'owns' structurally as row presence rather than possession state") rather than an unambiguous bug. **DISPOSITIONED, not fixed**: "owns" is deliberately row-presence-based, not state-based - added to "Explicitly NOT this story" as an explicit, reasoned decision rather than a silent gap.
- **[Low, Pass 1] Rejection tests didn't prove the "no partial write" property**, only the HTTP response shape. VERIFIED TRUE. **PATCHED**: all rejection tests now re-fetch the character and assert the equipment array is exactly what it was before the failed request.
- **[Low, Pass 2] A narrow delete-race** (concurrent add + container removal could produce an immediately-dangling reference). Judged low likelihood for a single-ST-admin tool; matches the already-scoped-out "no cascade/orphan handling" decision. **NO ACTION** - accepted risk, consistent with existing scope boundary.
- **[Low, Pass 3b] Two record-accuracy findings** (the "owns at least one container" Dev Agent Record claim not accounting for lost-state rows; the historical worktree-collision/sibling-repo claims being outside this review's own verifiable scope by its own ground rules). **NO ACTION on the second** (a disclosed reviewer-side scope limit, not a false claim); **first is the same lost-container disposition above**, already addressed by the "Explicitly NOT this story" addition.

### Verification performed this pass

- Re-ran the two directly-affected test files after every patch (81/81), then the full 9-file equipment suite (204/204, up from the pre-patch 196).
- Prove-discrimination performed for both load-bearing new pieces: the shared validator's single-level containment check (disabled -> exactly 1 test failed -> restored) and the `PUT /:id` route's wiring specifically (disabled -> exactly the 2 PUT-specific rejection tests failed, POST-route tests unaffected -> restored).
- `node --check` on `server/routes/characters.js` after the full patch set - clean.
- Confirmed via `git diff` against the diff file that Codex's own review process left the working tree unmodified, and confirmed the sibling `D:\Terra Mortis\TM Suite` directory's checked-out branch was untouched throughout (the other session had independently moved on to its own next story in the meantime).

**Status**: no unresolved High findings; every addressable Medium and most Low findings patched and verified; the two dispositioned-not-fixed items (lost-container semantics, the narrow delete race) are reasoned, documented decisions, not gaps -> `done`.
