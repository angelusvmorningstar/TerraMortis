# Story DBO.1: `purchasable_powers` schema declares `special`, cleans up dead `selected`

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the ST maintaining `purchasable_powers` and as TM Wiki's Epic 17 (which wants a load-bearing
filter on `special`),
I want `server/schemas/purchasable_power.schema.js` to declare `special` for what it now genuinely
is (a two-value marker read by live code), and the truly dead `selected` field removed from the
673 documents that still carry it,
so that the schema stops lying about what's on disk, `special` becomes a safe field to build on,
and the "was the strip script ever run, or does something put the fields back" question the epic
opened with has a permanent, coded answer instead of a comment nobody can act on.

## Why this story exists

The epic's own audit named the gap: `additionalProperties: false` but the schema declares neither
`selected` (666 of 673 live rows, 2026-08-07 count) nor `special` (527) — only 7 documents pass
their own schema. The schema's own comment (`:219-245`) said a purpose-built strip script existed
but either was never run or something re-seeds the field, and told the next reader to answer that
before writing anything new.

**Answered 2026-08-14, read-only investigation against live `tm_suite`, no writes — full evidence
in `specs/epic-dbo-database-ownership.md`'s DBO-1 section.** Neither field is re-seeded. Both are
un-migrated legacy data from the original Excel import, and nothing active can write either back:
`POST /api/rules` validates against this schema (rejects both on a new document), and
`PUT /api/rules/:key`'s `UPDATABLE_FIELDS` allowlist (`server/routes/rules.js:70-83`) excludes both,
so routine ST edits via the admin Rule Data table structurally cannot restore them. The archived
collection-wide strip script (`server/scripts/archive/strip-selected-from-purchasable-powers.js`)
has never been run with `--apply`. The only change since the 2026-08-07 counts is
`fix-1111-oath-row-hygiene.js` (OATH-A, issue #1111) — narrow, already applied, scoped to only the
ten `cost_model` rows (666→656 selected, 527→517 special, both exactly -10, confirming that scope
and nothing else moved).

**But the fix shape for `special` changed mid-epic.** Commit `b3a6ab4e` (2026-04-08) moved the CODE
from `rule.special` to `rule.sub_category` for standing-merit filtering and removed `special` from
schema/seed/PUT-allowlist/rules-editor-modal — but never migrated the pre-existing DATA, which is
the same root cause DBO-3 (this session, merged to `main`+`dev` today) diagnosed independently from
the opposite direction. **DBO-3 made `special` load-bearing again**: `isMeritEventGranted(rule)` in
`public/js/editor/merits.js:46` reads `rule.special === 'standing'`, live in production right now.
Live grouping of `special` by value today: `{null: 515, "standing": 2}` — the two `"standing"` rows
are exactly Mystery Cult Initiation and Professional Training, the pair DBO-3 depends on.

This means `special` can no longer be silently stripped collection-wide the way the epic originally
framed it (alongside `selected`). This story declares it instead.

## What this story is NOT

- **NOT running `--apply` against live `tm_suite`.** Per the epic's own hard constraint, nothing
  from this repo deploys or migrates production before the 2026-08-15 game. This story builds and
  tests the cleanup script against `tm_suite_test` only (mirroring `oxp-11`'s own precedent, whose
  migration script was built, tested, and left for Angelus to run for real). The dry-run default
  means running it bare against the configured database is always safe regardless.
- **NOT making `special` ST-editable.** Nothing in `admin/rules-view.js`'s Rule Data table UI reads
  or edits `special` today (confirmed by grep — the only `.selected`/`special` hits there are
  unrelated DOM `<option selected>` state and a stale code comment). `special` stays code-managed,
  read by exactly one function (`isMeritEventGranted`). Adding it to PUT's `UPDATABLE_FIELDS` is
  separate future work if an ST-facing editor is ever wanted.
- **NOT retiring or deleting the archived `strip-selected-from-purchasable-powers.js`.** It stays as
  a historical record. This story's own new script supersedes its SCOPE (handles `special` too, and
  correctly excludes the two `'standing'` rows the old script predates), not its existence.
- **NOT touching DBO-3's own code** (`isMeritEventGranted`, or any of the four call sites it
  patched). This story is additive; DBO-3's existing tests must pass unmodified.
- **NOT resolving DBO-4 through DBO-9.** Those stay `backlog`.
- **NOT a deploy.** Stays inside the pre-game freeze, same as every other DBO/OXP story this
  session.

## Acceptance Criteria

1. **`special` is declared in the schema, `selected` stays undeclared.**
   `server/schemas/purchasable_power.schema.js` gains, immediately before the existing `implemented`
   property:
   ```js
   // `special` — event-granted-merit marker, load-bearing since DBO-3
   // (isMeritEventGranted, public/js/editor/merits.js:46, reads
   // rule.special === 'standing'). Only two live rows use it (Mystery Cult
   // Initiation, Professional Training); the rest carry null. See
   // specs/epic-dbo-database-ownership.md, DBO-1, for the full investigation.
   special: {
     oneOf: [
       { type: 'string', enum: ['standing'] },
       { type: 'null' },
     ],
   },
   ```
   `selected` is deliberately NOT added — it stays undeclared, so `additionalProperties: false`
   continues to reject it, which is correct: the field is dead and being removed, not adopted.
   Replace the existing `:219-245` comment block (which asks the now-answered question) with a
   short pointer to the epic's own DBO-1 section rather than re-narrating the investigation inline.

2. **A new, testable cleanup script strips `selected` everywhere and `special` only where it is not
   `'standing'`.** New file `server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs`, following
   `migrate-office-purchases-to-seats.mjs`'s established shape (pure `plan`/`apply` split so tests
   never touch live data, dry-run default, `--apply` to write, JSON backup before any write, no
   shebang because a test suite imports it):
   - `export async function planCleanup(collection)` — reads every document, returns rows only for
     documents needing a change: `{ _id, key, unsetSelected: boolean, unsetSpecial: boolean }`.
     `unsetSpecial` is `true` **only when** `special` exists on the document **and** its value is
     not the literal string `'standing'` (covers `null` and any other stray value; never a doc
     whose `special === 'standing'`). A document needing neither unset is omitted from the result
     entirely (mirrors `planMigration`'s "empty means nothing to do" contract).
   - `export async function applyCleanup(collection, rows, { apply = false, log = () => {} } = {})`
     — dry-run by default (logs what each row would lose); `--apply` writes a full-document JSON
     backup to `server/scripts/_backups/dbo-1-field-cleanup-<ISO>.json` first (abort, write nothing,
     if the backup write throws — matching both prior scripts), then issues one `$unset` per row for
     exactly the flagged fields. Returns `{ cleaned, backedUp }` counts.
   - `export async function main(argv = process.argv)` — same auto-run guard as
     `migrate-office-purchases-to-seats.mjs` (`import.meta.url === pathToFileURL(...)`), same
     `MONGODB_DB` env-var override support so a test or a human can point it at `tm_suite_test`.
   - Idempotent: re-running `planCleanup` after a successful `--apply` returns `[]`.

3. **The safety invariant is proven, not just true of today's data.** A direct test seeds a document
   with `special: 'standing'` (real MCI/PT shape) alongside documents needing cleanup, runs
   `applyCleanup({ apply: true })`, and asserts the `'standing'` document is byte-for-byte unchanged
   afterward — not merely "the count of touched docs was N", the actual document. A second test
   proves the match is exact-string, not case- or whitespace-insensitive (a fixture with
   `special: 'Standing'` or `special: 'standing '` must be treated as cleanup-eligible, not
   preserved by a loose match that could someday hide a real bug).

4. **No regression to DBO-3.** `server/tests/dbo-3-standing-merit-filter.test.js` runs unmodified
   and stays green — this story does not touch `merits.js` or `downtime-form.js`.

5. **Schema validates the real shapes.** New direct tests against `purchasablePowerSchema` (ajv,
   `strict: false`, matching `fix-1111-oath-row-hygiene.js`'s own usage): a document shaped like the
   live MCI/PT row (`special: 'standing'`) validates; `special: null` validates; `special` absent
   validates; `special: 'anything-else'` fails; a document still carrying `selected` (any value)
   fails — proving the "stays undeclared" half of AC1 as directly as the "declared" half.

## Tasks / Subtasks

- [x] Task 1 — Schema declaration (AC: 1, 5)
  - [x] Add the `special` property to `purchasablePowerSchema`.
  - [x] Replace the `:219-245` comment block with the short pointer described in AC1.
  - [x] Schema-validation tests per AC5 (real-shape fixtures — MCI/PT's actual `category`, `name`,
        `key`, `rank`, `rating_range` fields alongside `special`, not a bare `{special: ...}` stub).
- [x] Task 2 — Cleanup script (AC: 2, 3)
  - [x] New `server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs` per AC2's exact shape.
  - [x] `tm_suite_test`-backed tests: confirmed real Mongo (Atlas, same cluster as live — see Dev
        Agent Record) is reachable in this environment, so these ran for real rather than skipping.
        Seeded a fixture set covering all shapes — `selected`-only, `special: null`-only, both
        together, the untouchable `special: 'standing'` row, and a clean control — ran `planCleanup`
        + `applyCleanup({apply: true})`, asserted exactly the expected `$unset`s happened, asserted
        `'standing'` survives unchanged (AC3), re-ran `planCleanup` and asserted `[]` (idempotency).
  - [x] Case/whitespace-sensitivity test per AC3's second half.
- [x] Task 3 — Regression check (AC: 4)
  - [x] Ran `server/tests/dbo-3-standing-merit-filter.test.js` unmodified; all 17 still green.
- [x] Task 4 — Full targeted gate and prove-discrimination
  - [x] Targeted gate: this story's new test file + `dbo-3-standing-merit-filter.test.js` +
        `n7-n9-allocator-readers.test.js` + `oath-a-d8-api-roundtrip.test.js` +
        `oath-b-d6-api-roundtrip.test.js` + `oath-b-suspension.test.js` = 127/128 (the 1 is the
        pre-existing, `CLAUDE.md`-documented #1115 failure, unrelated — confirmed present before this
        story touched anything).
  - [x] Prove-discrimination: inverted `planCleanup`'s `!== 'standing'` guard to `unsetSpecial: true`
        unconditionally (single change) — failed exactly the 2 tests protecting the `'standing'`
        invariant (`plans exactly the rows...` and the AC3 byte-for-byte test), nothing else; reverted,
        re-confirmed all 10 green.

## Dev Notes

### Live-data verification (2026-08-14, read-only queries against `tm_suite`, no writes)

```
purchasable_powers total: 673
selected exists:           656  (was 666 on 2026-08-07; -10 matches fix-1111-oath-row-hygiene.js's
                                  own scope exactly, confirming that script — and only that script —
                                  has run since)
special exists:             517  (was 527; same -10, same explanation)
special grouped by value:   { null: 515, "standing": 2 }
the two "standing" rows:    Mystery Cult Initiation, Professional Training (confirmed by dbo-3's own
                             own live-data check the same day — see dbo-3-xp-spend-standing-filter-bug.md)
```

Nothing in `public/` reads `.selected` against a purchasable-power shape (grepped exhaustively; the
only hits are unrelated DOM `<option selected>`/CSS state). Nothing in `public/` reads `.special`
except `isMeritEventGranted` (`merits.js:46`), added by DBO-3 this session.

### Why declare `special` instead of stripping it, reversing the epic's original framing

The epic (`epic-dbo-database-ownership.md`, DBO-1, as first written) treated `selected` and
`special` as the same kind of problem — dead fields to strip. That was correct until DBO-3 shipped
today. Now stripping `special` collection-wide would delete the exact two values
`isMeritEventGranted` depends on in production. Declaring it (two-value enum-or-null, mirroring the
existing `forfeiture` property's `oneOf [...shape, {type:'null'}]` pattern at `:203-217`) is the
smaller, safer move — consistent with this codebase's "any new reference-data introduction defaults
to MongoDB-backed, declared schema" convention (`CLAUDE.md`), not working against it.

### Architecture compliance

- **No CSS, no UI.** This is a schema + one-off script story; no markup or styling anywhere.
- **British English, no em-dashes** in any string/comment this story writes.
- **Mongo script conventions**: dry-run default, `--apply` to write, JSON backup before any write,
  no shebang on any script a test imports (the same shebang-breaks-vitest-transform hazard
  `migrate-office-purchases-to-seats.mjs`'s own header comment documents), pure `plan`/`apply`
  functions so tests never touch live data, `MONGODB_DB` env override for pointing at
  `tm_suite_test`.
- **This story does not run the script for real.** Per the epic's hard constraint and this
  project's "user runs all Mongo imports" convention, `--apply` against live `tm_suite` is
  Angelus's action, after the pre-game freeze lifts.

### Project Structure Notes

- Files touched: `server/schemas/purchasable_power.schema.js` (modified — new `special` property,
  comment block replaced).
- New files: `server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs`,
  `server/tests/dbo-1-purchasable-powers-schema-cleanup.test.js` (name TBD during dev — may split
  schema-validation tests and script tests into two files if that reads cleaner; either is fine,
  note the actual split in the File List).
- Deliberately unchanged: `server/routes/rules.js` (no allowlist change — see "What this story is
  NOT"), `public/js/admin/rules-view.js`, `public/js/editor/merits.js`,
  `public/js/tabs/downtime-form.js`, `server/scripts/archive/strip-selected-from-purchasable-powers.js`.

### References

- [Source: `specs/epic-dbo-database-ownership.md`, DBO-1] — full investigation write-up, live-data
  evidence, and the fix-shape-change rationale this story implements.
- [Source: `server/schemas/purchasable_power.schema.js:195-248`] — the `forfeiture` `oneOf` pattern
  this story's `special` property mirrors; the comment block this story replaces.
- [Source: `server/routes/rules.js:69-102`] — `UPDATABLE_FIELDS` allowlist (confirms neither field
  is PUT-writable today, and why this story leaves it that way) and the `POST` schema-validation
  path (confirms neither field is POST-writable either).
- [Source: `server/scripts/fix-1111-oath-row-hygiene.js`] — the narrow, already-applied precedent
  this story's live-count arithmetic (666→656, 527→517) is checked against; also the ajv usage
  pattern (`strict: false`) this story's schema tests mirror.
- [Source: `server/scripts/migrate-office-purchases-to-seats.mjs`] — the `plan`/`apply`/`main` shape,
  dry-run default, backup-before-write, and no-shebang conventions this story's new script follows.
- [Source: `specs/stories/dbo-3-xp-spend-standing-filter-bug.md`, Dev Notes "DBO-1 cross-reference"]
  — DBO-3's own statement that it was raising this story's stakes without resolving it; this story
  is that resolution.
- [Source: `specs/stories/sprint-status.yaml`, `dbo-1-purchasable-powers-schema-vs-data` entry] —
  the recorded answer to the epic's original open question, condensed from the epic file.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via `bmad-dev-story`.

### Debug Log References

- **Real Mongo confirmed reachable in this environment, not just `tm_suite_test`-in-theory**: ran an
  existing Mongo-backed suite (`oxp-11-office-purchase-seat-keying.test.js`) first — 24/24 passed in
  19s, genuinely connecting to Atlas (the same cluster as live, `MONGODB_DB` overridden to
  `tm_suite_test` by `setup-env.js`), not skipping. `CLAUDE.md`'s "needs a local mongod... SKIPs
  rather than fails" note turned out to mean "needs Mongo reachability" generically — this session's
  environment has it, so this story's own DB-backed tests ran for real rather than as an unverified
  skip.
- **Schema-test fixture bug (mine), fixed immediately**: first draft of `baseMerit` set `description`
  to `null`, but the schema declares `description: { type: 'string' }` with no null variant (unlike
  `resistance`/`cost`/etc., which do allow null) — three tests failed on an unrelated field before
  `special` was even reached. Fixed by dropping the non-required, non-nullable fields from the
  fixture (`description`, `rules_text`, `rules_source`) rather than guessing their nullability;
  `required: ['key', 'name', 'category']` doesn't need them.
- **Implementation deviates from AC1's literal code snippet, matching an existing convention more
  closely**: the story spec proposed `oneOf: [{type:'string', enum:['standing']}, {type:'null'}]`
  for `special` (mirroring `forfeiture`'s multi-shape discriminator pattern). During Task 1, found
  `cost_model` — a closer analogue (single-field enum-or-null, not a multi-shape object) — already
  uses the terser `{ type: ['string', 'null'], enum: ['standing', null] }` form. Used that form
  instead; behaviourally identical (both AC5 tests and the schema-shape convention pass either way),
  but consistent with the more directly comparable existing field rather than the discriminator
  pattern meant for multi-shape objects.
- **Live dry-run sanity check, read-only, no writes**: ran the new script bare (no `--apply`) against
  the configured (live `tm_suite`) database as a sanity check beyond the `tm_suite_test` suite —
  656 documents planned for `selected` removal (matches this story's own live-count verification
  exactly), and confirmed by name that `mystery-cult-initiation`/`professional-training` each show
  only `would $unset selected` — never `special` — proving the safety invariant against the real
  live rows it exists to protect, not just synthetic fixtures. No write occurred; dry-run is the
  script's default.

### Completion Notes List

- AC1: `special` declared on `purchasablePowerSchema` (`server/schemas/purchasable_power.schema.js`),
  `{ type: ['string', 'null'], enum: ['standing', null] }` — see Debug Log for the form-choice
  deviation from the story's drafted snippet. `selected` deliberately left undeclared. The `:219-245`
  comment block replaced with a condensed pointer to the epic's own DBO-1 section plus a fresh
  comment on `special` explaining why it's declared, not stripped.
- AC2: `server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs` — `planCleanup`/`applyCleanup`/
  `main`, dry-run default, `--apply` to write with a JSON backup first, `MONGODB_DB` override, no
  shebang, auto-run guard identical to `migrate-office-purchases-to-seats.mjs`'s. NOT run with
  `--apply` against live `tm_suite` — per the epic's hard constraint, that stays Angelus's action
  after the pre-game freeze lifts. Bare dry-run against the live DB confirmed the plan matches this
  story's own live-count verification exactly (656 rows, MCI/PT unaffected on `special`).
- AC3: proven by a dedicated byte-for-byte test (not just a touched-count assertion) plus a
  prove-discrimination revert (see Task 4) — the `'standing'` guard is exact-string, not case- or
  whitespace-insensitive, matching `isMeritEventGranted`'s own comparison exactly.
- AC4: `dbo-3-standing-merit-filter.test.js` run unmodified, all 17 still green — no regression.
- AC5: schema-validation tests cover all five real shapes named in the AC (standing, null, absent,
  bogus-value, still-has-selected).
- 10 new tests in `dbo-1-purchasable-powers-schema-cleanup.test.js` (5 schema-validation, 5 script/DB
  -backed), all green for genuine reasons — DB-backed half ran against real Atlas
  (`tm_suite_test`), not a skip. Full targeted gate: this file + `dbo-3-standing-merit-filter.test.js`
  + `n7-n9-allocator-readers.test.js` + the three oath suites = 127/128, the 1 being the
  pre-existing, `CLAUDE.md`-documented #1115 failure. Prove-discrimination pass (single-change
  revert of the `special !== 'standing'` guard) failed exactly the 2 tests protecting that
  invariant, nothing else; restored and re-verified green. No writes to live `tm_suite` at any point
  (schema tests are pure ajv; DB tests scoped to a `dbo-1-test-` key prefix in `tm_suite_test`; the
  one live-DB script invocation was a bare dry-run, read-only by the script's own default). No
  deploy, no migration, no commit to `main` — stays inside the pre-game freeze.

### File List

- `server/schemas/purchasable_power.schema.js` (modified — new `special` property, `:219-245`
  comment block replaced)
- `server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs` (new)
- `server/tests/dbo-1-purchasable-powers-schema-cleanup.test.js` (new)
