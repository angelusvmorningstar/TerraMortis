# Story DBO.8: Retire the dead relationship-linked touchstone mechanic

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a developer maintaining `characters.touchstones[]` and the `relationships` collection,
I want the dormant `edge_id`/`touchstone_meta`/`kind:'touchstone'` mechanism removed from the schema
and code, rather than "split" as the epic originally proposed,
so that this repo stops carrying design and validation surface for a code path that has been
unreachable since issue #162 and has zero live documents using it.

## Why this story exists

DBO-8 opened asking to resolve "the Humanity rating is stored twice" — `characters.touchstones[].humanity`
and `relationships.touchstone_meta.humanity` — before splitting `touchstones[]` into a mechanic slot
(`{humanity, edge_id?}`) and a separate identity record. Its own text names the "resolve first" step:
*"Query whether they currently disagree before touching either."*

**That investigation is what changed this story's shape (2026-08-14, this session, read-only, no
writes).** Live query against `tm_suite`:

- **0 of 44** live `touchstones[]` entries (30 characters) carry `edge_id`. Every one is a free-text-
  only entry.
- **1** `kind:'touchstone'` relationship edge exists in the whole database. It is `status: 'retired'`
  and is not referenced by any character's `touchstones[].edge_id` — an orphan.
- Traced why: `public/js/editor/edit.js`'s own comment names **issue #162**: *"NPC picker branch
  dropped — Touchstone is free-text only... Legacy entries with edge_id continue to render and edit;
  their edges sit dormant in relationships."* The only code path that ever assigned `edge_id` to a
  new touchstone was removed. Neither the player sheet editor nor any admin surface has a surviving
  creation path for one.

There is no live disagreement to reconcile, because nothing live uses the dual-storage shape the
epic's question was about. Angelus's own call (this session, given this evidence): retire the dead
mechanic outright rather than build a split around it. This is a smaller, more contained story than
the epic's original framing — a removal, not a redesign.

## What this story is NOT

- **NOT a schema redesign.** No new shape for `touchstones[]` beyond removing the `edge_id` property.
  It stays `{humanity, name, desc?}` — which is already what every live entry actually is.
- **NOT deleting the one orphaned `relationships` document from live `tm_suite` in this story's own
  execution.** Per this project's standing "one-off scripts are run by a human, not an agent"
  convention (same shape as DBO-1's cleanup script), a small plan/apply script is written and dry-run
  tested against `tm_suite_test`, but `--apply` against live data is Angelus's own action, and stays
  outside the pre-game freeze (nothing from this repo migrates production before 2026-08-15).
- **NOT touching TM Wiki's own copy of this concern** (its own story, 31-6). This repo's schema and
  code only.
- **NOT resolving any other DBO story.** Independent, though it closes the "resolve first" question
  DBO-8's own epic text posed.

## Acceptance Criteria

1. **`characters.schema.js`'s `touchstones[]` item schema drops `edge_id`.** Stays
   `{humanity, name, desc?}` (already `required: ['humanity', 'name']`) — remove the `edge_id`
   property and its comment block; correct the surrounding NPCR.4 comment, which currently describes
   a linking mechanism that no longer exists in code, to state plainly that touchstones are free-text
   only.
2. **`relationships.schema.js` drops `'touchstone'` from `KIND_ENUM` and drops
   `touchstoneMetaSchema`/the `touchstone_meta` property.** No other `KIND_ENUM` value, no other
   schema shape, changes.
3. **`server/routes/relationships.js` drops every `kind === 'touchstone'`-specific branch**: the
   creation-time validation requiring `touchstone_meta.humanity` and a pc+npc endpoint pair, the
   `touchstone_meta` assignment on create, and the `touchstone_meta` clear-on-kind-change /
   `CLEARABLE`/`TRACKED` field entries. Every other relationship `kind` (sire, childe, ally, etc.)
   is untouched.
4. **`server/routes/characters.js` drops the `edge_id` half of touchstone handling, keeps the rest.**
   `validateTouchstones` keeps its cap (max 6) and humanity-in-anchor-range checks; the `edge_id`
   cross-validation block against the `relationships` collection is removed. `enrichTouchstoneNpcNames`
   and its three call sites are removed entirely (nothing left to enrich once `edge_id` is gone). The
   stale `touchstone_edge_ids[]` doc-comment (a superseded field name from an earlier design,
   confirmed never a real field — only ever appears in comments) is removed, not just the code.
5. **`public/js/editor/edit.js` drops the `edge_id`-linked branches** in touchstone add/edit/remove
   (the "mirror state onto the linked edge", "retire the linked edge on delete" paths) — the free-text
   add/edit/remove paths (already the only ones any live touchstone uses) are untouched.
6. **`public/js/editor/sheet.js` drops the `edge_id`-driven "character"/"object" kind badge and
   `_npc_name` rendering**, and the stale `touchstone_edge_ids` branch comment at the `renderTouchstones`
   call site. A touchstone slot renders its `name`/`desc` the same way for every entry — there is no
   longer a "kind" to distinguish, since every live entry already renders as the free-text path today.
7. **A small plan/apply script (not run against live `tm_suite`)** identifies the one orphaned
   `kind:'touchstone'` relationship document (or any document that would match, if live data has
   changed since this story was written) so Angelus can clean it up post-freeze — mirroring
   `dbo-1-purchasable-powers-field-cleanup.mjs`'s own dry-run-default, backup-on-apply shape.
8. **No regression.** Every existing touchstone-related test still passes, or is updated to match the
   new (smaller) schema/code surface if it specifically asserted `edge_id` behaviour. New tests prove
   the free-text-only path is unaffected and that `edge_id`/`touchstone_meta`/`kind:'touchstone'` are
   genuinely gone from both schemas.

## Tasks / Subtasks

- [x] Task 1: Schema changes (AC: #1, #2)
  - [x] Remove `edge_id` from `server/schemas/character.schema.js`'s `touchstones[]` item schema;
        correct the NPCR.4 comment block
  - [x] Remove `'touchstone'` from `KIND_ENUM` and `touchstoneMetaSchema`/`touchstone_meta` from
        `server/schemas/relationship.schema.js`
- [x] Task 2: `relationships.js` route cleanup (AC: #3)
  - [x] Remove the `kind === 'touchstone'` validation branch (`touchstoneShapeError`, both call
        sites — POST and PUT), the player-path "managed from the character sheet" guard (now
        unreachable — the schema itself rejects `kind='touchstone'` before this code runs), the
        `touchstone_meta` create-time assignment, and its `CLEARABLE`/`TRACKED` entries
  - [x] Confirm every other `kind` value's behaviour is unchanged — full regression across
        `api-relationships*.test.js` (5 files), 285+ tests, all green
- [x] Task 3: `characters.js` route cleanup (AC: #4)
  - [x] Strip `validateTouchstones` to cap + humanity-range checks only (now synchronous — it no
        longer awaits a `relationships` lookup); remove the `edge_id` cross-validation block
  - [x] Remove `enrichTouchstoneNpcNames` and all three call sites (`GET /`, `GET /?mine`, `GET /:id`
        — the third call site's now-unused `forPlayer` local was also removed)
  - [x] Remove the stale `touchstone_edge_ids[]` doc-comment (confirmed by grep: never a real field,
        only ever appeared in this comment and one archived script)
- [x] Task 4: `edit.js` client cleanup (AC: #5)
  - [x] Remove the `edge_id`-linked mirror-on-edit branch (`shTouchstoneSaveEdit`) and
        retire-on-delete branch (`shTouchstoneRemove`, plus its now-plain confirm-modal body text)
  - [x] Confirm the free-text add/edit/remove paths are otherwise untouched — removed the now-dead
        `apiGet` import (its only use was the mirror-on-edit fetch)
- [x] Task 5: `sheet.js` client cleanup (AC: #6)
  - [x] Remove the "character"/"object" kind badge and `_npc_name` rendering (read-only row +
        edit-mode slot, both render paths)
  - [x] Remove the stale `touchstone_edge_ids` branch comment at the `renderTouchstones` call site
        and the module-level doc comment above `renderTouchstones` itself
- [x] Task 6: One-off cleanup script for the orphaned relationship doc (AC: #7)
  - [x] `planCleanup`/`applyCleanup`/`main` shape (mirrors `dbo-1-purchasable-powers-field-
        cleanup.mjs` exactly), dry-run default, tested against `tm_suite_test` only (4 tests, real
        Atlas), NOT run `--apply` against live `tm_suite`. Bare dry-run sanity check against the
        live DB (read-only, no write — same pattern DBO-1 used) confirmed the plan matches the
        pre-story investigation exactly: 1 document, the same retired, orphaned edge.
- [x] Task 7: Regression proof (AC: #8)
  - [x] Rewrote `api-touchstone-edges.test.js` (the dedicated suite for this mechanism) — kept the
        cap/humanity-range tests unchanged, replaced every `edge_id`/`touchstone_meta`-specific test
        with one proving the schema now rejects them, removed the `_npc_name` enrichment describe
        block entirely (11 tests, all green)
  - [x] Updated `api-relationships-player-create.test.js`'s "kind='touchstone'" test — the specific
        "managed from the character sheet" business message it used to assert is unreachable now
        (schema rejects the kind before that handler code runs); reworded to assert the generic
        `VALIDATION_ERROR` shape instead (9 tests, all green)
  - [x] Full regression: 24 test files across `characters`/`relationships`/`touchstones`/the new
        cleanup script — **394 tests, all green**, plus a syntax check on all 7 touched/new code files

## Dev Notes

### Pre-story investigation (this session, read-only, no writes) — the load-bearing part of this story

- Live counts, `tm_suite`: `relationships` collection has exactly 1 `kind:'touchstone'` document,
  `status:'retired'`, orphaned (no character references it). `characters.touchstones[]` has 44
  entries across 30 characters, **0 with `edge_id` set**.
- `public/js/editor/edit.js` (around the touchstone save/remove functions) is the primary evidence:
  its own comment cites issue #162 removing the only creation path for an `edge_id`-linked
  touchstone. Legacy entries "continue to render and edit; their edges sit dormant" — but there are
  zero such legacy entries left in live data to render.
- Full call graph of the code being removed, confirmed by direct read (re-verify at dev time, don't
  trust line numbers below without checking):
  - `server/routes/characters.js`: `validateTouchstones` (cap/humanity-range checks to KEEP,
    `edge_id` cross-validation to REMOVE), `enrichTouchstoneNpcNames` (REMOVE entirely, 3 call sites),
    a stale `touchstone_edge_ids[]` doc-comment (REMOVE, was never a real field — confirmed by grep,
    only ever appears in comments, an earlier design superseded by per-entry `edge_id`).
  - `server/routes/relationships.js`: `kind==='touchstone'` validation branch (requires
    `touchstone_meta.humanity`, pc+npc endpoints), `touchstone_meta` assignment on create, its
    `CLEARABLE`/`TRACKED` field-list entries.
  - `public/js/editor/edit.js`: the "mirror description onto the linked edge" branch in the save-edit
    path, the "retire the linked edge" branch in the remove path.
  - `public/js/editor/sheet.js`: the `t.edge_id ? 'character' : 'object'` kind badge, `_npc_name`
    rendering, a stale `touchstone_edge_ids` comment at the `renderTouchstones` call site.

### Architecture compliance

- No new UI. This is a removal — if anything, the "character"/"object" kind badge disappears since
  it no longer has a meaningful distinction to draw (every entry is the same free-text shape).
- British English, no em-dashes in any string/comment this story writes.
- Follow `dbo-1-purchasable-powers-field-cleanup.mjs`'s exact shape for Task 6's script (dry-run
  default, backup-on-apply, `MONGODB_DB` override for `tm_suite_test`, plan/apply/main functions
  taking the collection as an argument so a test can never reach live data by accident).

### Project Structure Notes

- Files touched: `server/schemas/character.schema.js`, `server/schemas/relationship.schema.js`,
  `server/routes/relationships.js`, `server/routes/characters.js`, `public/js/editor/edit.js`,
  `public/js/editor/sheet.js`, plus a new one-off script and its test file.
- Deliberately unchanged: everything about `touchstones[]`'s free-text shape (`humanity`, `name`,
  `desc`) and every other `relationships` `kind` value's behaviour.

### References

- Epic: `specs/epic-dbo-database-ownership.md`, DBO-8 section (note: this story's own scope is
  narrower than that section's original framing — update the epic section when this story lands).
- Precedent for "answer the question before writing code": `specs/stories/dbo-1-purchasable-powers-schema-vs-data.md`.
- Cleanup-script shape precedent: `server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs`.
- Issue #162 (cited in `edit.js`'s own comment) — the change that made this mechanism dormant.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5).

### Debug Log References

- `validateTouchstones` changed from `async` to synchronous (it no longer awaits a `relationships`
  lookup) — its one call site updated to match (dropped the now-redundant `await` and the unused
  `characterId` parameter, since the cross-collection check it existed for is gone).
- Confirmed via repo-wide grep that no live code path references `edge_id`/`touchstone_meta`/
  `touchstone_edge_ids` any more outside of explanatory comments — the only remaining hits are in
  `server/scripts/archive/` (already-archived historical scripts, correctly left alone, same
  precedent as DBO-1's own archived strip script).
- Cleanup script's `planCleanup` run read-only against live `tm_suite` (via its exported function,
  never the CLI, matching this project's established "verify without invoking the script" pattern)
  found exactly the one document the pre-story investigation named — same `_id`, same
  `status:'retired'`, same `touchstone_meta.humanity:6`. Confirms the script targets the right
  document without needing to run `--apply`.
- Full regression: 24 test files (`api-characters*`, `api-relationships*`, `api-touchstone-edges`,
  `dt-form-territory-fresh-fetch`, `equipment`, `middleware-cache-control`, `n1/n3/n4/n5-*`,
  `oath-a-d8/oath-b-d6-api-roundtrip`, `oxp-4/5/11-*`, plus the two new DBO-8 suites) — **394 tests,
  0 failures**. No writes to live `tm_suite` at any point.

### Completion Notes List

- AC1: `edge_id` removed from `character.schema.js`'s `touchstones[]` item schema; comment corrected
  to state the free-text-only reality plainly.
- AC2: `'touchstone'` removed from `relationship.schema.js`'s `KIND_ENUM`; `touchstoneMetaSchema` and
  the `touchstone_meta` property removed entirely.
- AC3: `relationships.js` — `touchstoneShapeError` (used at both the POST and PUT call sites) removed;
  the player-path "Touchstones are managed from the character sheet" 400 removed (unreachable once
  the schema itself rejects the kind); the `touchstone_meta` create-time assignment removed; the PUT
  route's `kindForSave !== 'touchstone'` clear and the `CLEARABLE`/`TRACKED` array entries removed.
  Every other `kind` value's create/edit/list/duplicate-detection behaviour is byte-for-byte
  unchanged — confirmed by running the other 4 `api-relationships*.test.js` files unmodified.
- AC4: `characters.js`'s `validateTouchstones` now does cap + humanity-range only;
  `enrichTouchstoneNpcNames` and its three call sites (`GET /`, `GET /?mine`, `GET /:id`) removed;
  the stale `touchstone_edge_ids[]` doc-comment removed.
- AC5: `edit.js`'s `shTouchstoneSaveEdit` no longer fetches/mirrors state onto a linked edge;
  `shTouchstoneRemove` no longer retires a linked edge and its confirm-modal text is now
  unconditional. The now-dead `apiGet` import removed (its only use was the mirror-on-edit fetch);
  `apiDelete` kept (still used elsewhere in the file, for equipment removal).
- AC6: `sheet.js`'s `renderTouchstones` (both the read-only row and the edit-mode slot) no longer
  reads `_npc_name` or renders a "character"/"object" kind badge — every touchstone renders
  identically by `name`/`desc`. Stale doc comments corrected in three places.
- AC7: `server/scripts/dbo-8-orphaned-touchstone-edges-cleanup.mjs` — `planCleanup`/`applyCleanup`/
  `main`, dry-run default, backup-on-apply, mirrors `dbo-1-purchasable-powers-field-cleanup.mjs`'s
  shape exactly. NOT run with `--apply` against live `tm_suite` — that stays Angelus's action, though
  unlike DBO-1's own migration script this one carries no urgency (no live compounding-hazard risk;
  the one orphaned document is inert and the schema change alone already prevents any new one from
  being created).
- AC8: no regression — 394 tests green across 24 files. New coverage: `api-touchstone-edges.test.js`
  rewritten (11 tests: cap/range validation kept, `edge_id`/`touchstone_meta` rejection added, the
  old `_npc_name` enrichment suite removed since there is nothing left to enrich);
  `dbo-8-orphaned-touchstone-edges-cleanup.test.js` new (4 tests); `api-relationships-player-create.test.js`
  updated (1 test reworded for the now-unreachable business message).
- No deploy, no migration, no `--apply` against live `tm_suite` at any point — this story's own code
  changes are schema/route/client only; the one live-data action (deleting the orphaned document)
  stays Angelus's, whenever he chooses, with no urgency attached.

### File List

- `server/schemas/character.schema.js` (modified — `touchstones[]` drops `edge_id`, AC1)
- `server/schemas/relationship.schema.js` (modified — `KIND_ENUM` drops `'touchstone'`,
  `touchstoneMetaSchema`/`touchstone_meta` removed, AC2)
- `server/routes/relationships.js` (modified — `touchstoneShapeError` and every `kind==='touchstone'`
  branch removed, AC3)
- `server/routes/characters.js` (modified — `validateTouchstones` trimmed, `enrichTouchstoneNpcNames`
  and its 3 call sites removed, AC4)
- `public/js/editor/edit.js` (modified — edge-linked mirror/retire branches removed, dead `apiGet`
  import removed, AC5)
- `public/js/editor/sheet.js` (modified — kind badge + `_npc_name` rendering removed, AC6)
- `server/scripts/dbo-8-orphaned-touchstone-edges-cleanup.mjs` (new — AC7)
- `server/tests/dbo-8-orphaned-touchstone-edges-cleanup.test.js` (new — 4 tests, AC7/AC8)
- `server/tests/api-touchstone-edges.test.js` (rewritten — 11 tests, AC8)
- `server/tests/api-relationships-player-create.test.js` (modified — 1 test reworded, AC8)
