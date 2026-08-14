# Story DBO.2: `character_dossier` schema, and the `fact_key` mint TM Wiki's reveal path is waiting on

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the ST who has not yet decided which dossier facts are known in play, and as TM Wiki's already-built
but deliberately dark fact-level visibility system,
I want `server/schemas/character_dossier.schema.js` to actually exist and describe the 30 documents /
442 facts on disk, and every one of those facts to carry a durable opaque `fact_key`,
so that the two code sites citing a phantom schema stop lying, and TM Wiki gains the one upstream
thing its own spec names as the single dependency it cannot satisfy itself, after which flipping
`wiki_config.fact_level_enabled` and building the actual ST reveal action becomes TM Wiki's own
future story rather than a blocked one.

## Why this story exists

The epic opened DBO-2 with two defects on one collection. Both have since been investigated to a
conclusion, and the second one's conclusion changed this story's shape substantially. Full write-up in
`specs/epic-dbo-database-ownership.md`, DBO-2 section; condensed here.

**Defect 1: `server/schemas/character_dossier.schema.js` does not exist**, despite being cited as
authority by two sites.

- `server/scripts/_dossier-audit.js:3` - `import { DOSSIER_TAGS } from '../schemas/character_dossier.schema.js';`
  Confirmed 2026-08-14 by actually running the import: it throws `ERR_MODULE_NOT_FOUND`. The audit
  script is not merely stale, it is unrunnable.
- TM Wiki's `server/routes/characters.js:219-229` - a comment citing the same path as the authority
  for `character_id`'s type. **Already self-corrected on TM Wiki's side** by their own Story 31-1,
  which replaced the citation with an explicit "NO SUCH FILE EXISTS" note and re-justified their
  `['string', 'object']` tolerance from live data instead. Nothing for this story to do in that repo,
  but writing the real schema is what lets that note eventually be replaced by a real citation.

**Defect 2: the reveal path was never wired.** All 442 facts are `st_hidden: true`; `revealed_to`
appears on zero of them. Confirmed by live aggregation that this is not concentrated on the 13
`secret`-tagged facts: every one of the 26 live tags is 100% hidden, including plainly non-sensitive
ones (`aspiration:35`, `worldview:34`, `motivation:31`, `sire:27`, `haven:18`, `hunting_method:25`).

**RESOLVED, and this is the part that reshapes the story.** Presented to Angelus as a genuine choice
(full concealment intended, versus mechanism simply unbuilt) rather than decided unilaterally.
**Angelus's call, verbatim: *"I have yet to set what is revealed, so starting hidden is correct."***
So today's all-hidden state is correct and must not be touched. What follows is only that a reveal
mechanism needs to exist so he can set reveals when he chooses to.

**Where that mechanism lives is also now decided, and it is not this repo.** Three candidates were
traced:

- **TM Cockpit - rejected.** Its Atlas credential is hard-scoped to exactly seven collections
  (`ordeal_responses`, `ordeal_submissions`, `questionnaire_responses`, `characters`,
  `downtime_submissions`, `downtime_cycles`, `game_sessions`), per `../TM Cockpit/lib/connect.mjs`'s
  own header comment. `character_dossier` is not among them. Cockpit's own ADR-001 had already
  declined to build dossier-write tooling there for a related reason.
- **TM Suite admin - possible but redundant.** The pattern exists (the Relationship Editor), but
  building a second reveal model here would compete with one already built elsewhere.
- **TM Wiki - chosen.** TM Wiki has a complete, already-built, currently-dark reveal mechanism:
  `tm_wiki.visibility_prefs` (`../TM Wiki/server/wiki-schemas/visibility-prefs.schema.js`), which
  already declares `subject_type: 'fact'` with `subject_ref: { fact_key }`, three tiers
  (`private` / `semi_private` / `public`), `semi_private_groups`, and `named_reveals` /
  `named_conceals`. It is gated off today behind `wiki_config.fact_level_enabled: false`, for exactly
  one documented reason.

That reason is the authoritative contract this story exists to satisfy. From
`../TM Wiki/specs/tm-wiki-schema.md`, section "## The fact_key dependency", quoted exactly:

> "Fact-level visibility and fact-level corrections need a durable per-fact key. Canonical
> `character_dossier.facts[]` entries are POSITIONALLY addressed today, with no stable key: any
> reorder / insert / delete silently repoints every reference. This is an upstream TM Suite
> (canon-side) change and the single dependency this foundation cannot satisfy itself:
> TM Suite mints a durable opaque `fact_key` (ULID/nanoid) on every dossier fact, once at creation,
> **preserved across ST re-authoring** (never the array index, never a value hash). A one-off backfill
> migration stamps existing dossiers."

The same section states the unblocking condition just as plainly: *"When the mint lands and is
backfilled, flip the flag - no wiki schema change needed, `fact_key` was always in the schema, just
gated."*

Angelus confirmed the use case this ultimately serves is **ST narrative reveal** (he decides when a
secret becomes known in play), not player self-disclosure. The same `fact_key` dependency blocks both,
and TM Wiki's spec is explicit that the mint is the only thing gating `fact_level_enabled`. So this
story's whole job on the TM Suite side is: write the honest schema, mint the key, backfill it. The
reveal action itself is TM Wiki's own future story, writing to TM Wiki's own `tm_wiki` database.

## What this story is NOT

- **NOT building any reveal writer, admin UI, Cockpit UI, or API route.** No file under
  `server/routes/`, `public/js/admin/`, or `../TM Cockpit/` is touched. The reveal action is TM Wiki's
  own future story against `tm_wiki.visibility_prefs`, once this mint is backfilled.
- **NOT changing any existing fact's `st_hidden` value.** All 442 stay `true`. Angelus's decision is
  that this is correct, not a bug. A migration that flips even one is a defect, and AC6's
  byte-for-byte assertion exists to prove it did not happen.
- **NOT changing any existing fact's `revealed_to` value.** Zero facts carry one today; zero must
  carry one after this story. The field is *declared* in the schema (TM Wiki's shipped
  `filterVisibleFacts` reads it today, so it is a live reader contract, not a dead field), but nothing
  here writes it.
- **NOT flipping TM Wiki's `wiki_config.fact_level_enabled`.** Different repo, different database,
  TM Wiki's own action. This story's completion is the signal that they *can*, not the act of doing it.
- **NOT running `--apply` against live `tm_suite`.** Same standing convention as DBO-1, DBO-4 and
  DBO-8: the script is built, tested against `tm_suite_test`, and left dry-run-by-default for Angelus
  to run himself.
- **NOT DBO-7.** The broader `character_dossier` / `archive_documents` handover to TM Wiki is separate,
  larger, cross-repo work. DBO-7 depends on this story landing first (the epic already says so), but
  none of its per-field `sheet_field` / `sheet_value` / `clash` triage happens here.
- **NOT touching the one-off historical scripts under `server/scripts/_*.js` that already wrote
  `character_dossier`** - `_verify-entities.js`, `_rene-disambig.js`, `_infer-havens.js`,
  `_havens-and-locations.js`, `_einar-secret-fix.js`, `_dossier-stub-cleanup.js`, `_coverage.js`. They
  are one-off and already run. Only `_dossier-audit.js` is touched, and only to re-point its dead
  import at the real file. No other change to that script.
- **NOT adding a MongoDB `$jsonSchema` collection validator.** Live `character_dossier` has none today
  (confirmed via `listCollections`), no route validates against it, and adding one is a separate,
  riskier decision. This schema is documentation plus a test contract, exactly as
  `_dossier-audit.js`'s own output line ("schema is documentation-only") already assumes.

## Live-data inventory (2026-08-14, read-only queries against `tm_suite`, no writes)

Everything the schema declares is derived from this, not guessed. 30 documents, 442 facts.

Top-level keys, with the count of documents carrying each:

```
_id: 30   character_id: 30   facts: 30   updated_at: 30   source: 29   source_note: 1
```

`character_id` is a **BSON ObjectId on all 30 documents** (not a string). This is the fact TM Wiki's
`characters.js` comment wanted a schema citation for, and why their `['string', 'object']` tolerance
plus `String()` normalisation is correct.

Fact keys, count of facts carrying each, and observed value types:

```
tag: 442          string           value: 442        string
source: 442       string           st_hidden: 442    boolean (all true)
note: 37          string           sheet_field: 32   string
clash: 32         boolean (all false)               sheet_value: 31   string
counterparty: 28  string           npc_id: 24        string | null
since: 18         string           severity: 13      string
compromised: 13   boolean          status: 9         string
fact_key: 0       (does not exist yet - this story mints it)
revealed_to: 0    (does not exist yet - TM Wiki reads it, nothing writes it)
```

Closed-ish vocabularies observed:

```
tags (26):     aspiration:35, worldview:34, motivation:31, notable_event:29, sire:27,
               embrace_event:27, touchstone:27, notable_enemy:25, hunting_method:25,
               faction_history:23, family_member:21, key_location:20, haven:18,
               notable_ally:18, mortal_vocation:14, secret:13, embrace_location:12,
               current_activity:9, mortal_faction:8, birthplace:7, signature_ability:5,
               debt:5, boon:4, birth_year:2, brood_sibling:2, early_nights:1
fact source:   excel:357, history:51, downtime:18, questionnaire:16
doc source:    excel:23, history:4, questionnaire:2, (absent):1
severity:      major:10, life_threatening:2, minor:1   (only on secret-tagged facts)
status:        outstanding:9                            (only on boon / debt facts)
compromised:   true:10, false:3                         (only on secret-tagged facts)
```

`counterparty` holds **names, not references** - `_dossier-audit.js`'s own check at `:27` already
reports each one as `(NAME - not a ref)`. It stays a plain string here; turning it into a real
reference is DBO-7's problem, not this story's.

## Acceptance Criteria

1. **`server/schemas/character_dossier.schema.js` exists and describes the real documents.** New file,
   following the shape and comment conventions of `server/schemas/relationship.schema.js` and
   `server/schemas/npc_flag.schema.js` (draft-07, `$schema` / `title` / `type` / `required` /
   `additionalProperties: false`, named sub-schema consts, exported enums/inventories above the main
   schema). It declares:
   - Top level, `required: ['character_id', 'facts']`, `additionalProperties: false`:
     `_id`, `character_id`, `facts` (array of the fact sub-schema), `source`, `source_note`,
     `updated_at`.
   - `character_id: { type: ['string', 'object'] }`, with a comment stating that all 30 live documents
     store a BSON ObjectId, that this declaration is the authority TM Wiki's
     `server/routes/characters.js` was reaching for, and that consumers normalise with `String()`.
     Ajv cannot express BSON ObjectId directly; `'object'` is the honest declaration, not a shrug.
   - The fact sub-schema, `additionalProperties: false`, declaring every field in the inventory above
     plus `fact_key` and `revealed_to`: `tag`, `value`, `source`, `st_hidden`, `fact_key`,
     `revealed_to`, `note`, `sheet_field`, `sheet_value`, `clash`, `counterparty`, `npc_id`, `since`,
     `severity`, `compromised`, `status`.
   - `npc_id: { type: ['string', 'null'] }` (both shapes are live).
   - `revealed_to: { type: 'array', items: { type: 'string' } }`, with a comment naming TM Wiki's
     `filterVisibleFacts` as its only current reader and stating that nothing in this repo writes it.
   - `severity: { type: 'string', enum: ['minor', 'major', 'life_threatening'] }` - a genuinely closed,
     ordered vocabulary, enum it.
   - `status: { type: 'string', minLength: 1 }` - **not** an enum. Only one live value
     (`'outstanding'`) exists, nothing reads it, and a debt plausibly gains `settled` / `forgiven`
     later. Enum-ing a single observed value would turn a data edit into a schema change.

2. **`fact_key` is declared as a required, opaque, immutable string.**
   `fact_key: { type: 'string', minLength: 1 }`, and `fact_key` is in the fact sub-schema's `required`
   array alongside `tag`, `value`, `source`, `st_hidden`.
   - **Minting mechanism: `randomUUID()` from `node:crypto`.** Checked before choosing:
     `server/package.json` declares neither `nanoid` nor `ulid` (nanoid appears in
     `server/package-lock.json` only as a transitive dependency of vitest, a devDependency, so it is
     not safe to import from production code), and a repo-wide grep for `randomUUID` / `randomBytes` /
     `nanoid` / `ulid` finds **no existing opaque-ID minting precedent anywhere in first-party source**.
     `randomUUID()` is built in, requires no new dependency, and is available under this repo's
     declared `engines.node: ">=20.19.0"`. TM Wiki's spec says "ULID/nanoid" descriptively, naming the
     *class* of key, not a format mandate: their `visibility_prefs` schema declares
     `subject_ref.fact_key` as `{ type: 'string', minLength: 1 }`, which a UUID string satisfies
     unchanged. Verified against their schema file directly.
   - The schema comment must state the three invariants TM Wiki's contract turns on, in these terms:
     minted **once at creation**, **never** the array index, **never** a hash of the value, and
     **preserved across ST re-authoring** - so a reorder, insert, or delete of `facts[]` can never
     repoint an existing reference.
   - **Known transitional state, and it must be stated in the schema's own header comment rather than
     discovered later:** until the AC4 backfill is run with `--apply` against live `tm_suite`, all 442
     live facts fail this `required` on `fact_key`. That is intended and visible, not an oversight.
     Nothing validates this collection at runtime (no route, no `$jsonSchema` validator), so `required`
     here has no live blast radius; it is a documentation and test contract, and the migration is the
     thing that closes the gap.

3. **`st_hidden` is required on every fact, and the reason is written down.** TM Wiki's shipped
   `filterVisibleFacts` (`../TM Wiki/server/routes/characters.js:210-214`) reads
   `if (fact.st_hidden !== true) return true;` - **fail-open**. A fact minted without `st_hidden` is
   therefore visible to everyone, silently. All 442 live facts carry it, so requiring it costs nothing
   today and closes a real default-open hazard for every future writer. Say exactly that in the schema
   comment. (TM Wiki's newer `visibility_prefs` projection is allowlist / fail-closed by design; the
   `filterVisibleFacts` path described here is the one that is live today.)

4. **`DOSSIER_TAGS` is exported, and `_dossier-audit.js` runs again.**
   - `export const DOSSIER_TAGS = [...]` - the 26 tags in the inventory above.
   - `tag` is declared as `{ type: 'string', minLength: 1 }`, **not** `enum: DOSSIER_TAGS`.
     `_dossier-audit.js:13-14` uses `DOSSIER_TAGS` as a *known-tag* set and prints `<DRIFT>` beside any
     tag outside it. That is drift *reporting*, not drift *rejection* - enum-ing the tag would make
     adding a tag a schema change and would contradict the script the export exists to serve.
   - Also export `DOSSIER_FACT_SOURCES = ['excel', 'history', 'downtime', 'questionnaire']` as a
     documented inventory, and likewise do **not** enum `source`. Evidence it is not closed:
     `server/scripts/_rene-disambig.js:11` filters on `source: 'st'`, a value that exists in no live
     fact.
   - `server/scripts/_dossier-audit.js` is edited **only** to make its existing line 3 import resolve.
     If the import path was already correct (it is), no edit to that line is needed at all and the file
     may be left byte-identical - confirm which, and say so in the File List. No other change to that
     script under any circumstances.

5. **A new one-off backfill script stamps every unkeyed fact, and touches nothing else.** New file
   `server/scripts/dbo-2-dossier-fact-key-backfill.mjs`, mirroring
   `server/scripts/dbo-8-orphaned-touchstone-edges-cleanup.mjs` and
   `server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs` exactly for shape and conventions:
   dry-run by default, `--apply` to write, full-document JSON backup before any write, no shebang (a
   shebang breaks vitest's transform for any file importing it), `MONGODB_DB` env override,
   `import.meta.url === pathToFileURL(process.argv[1]).href` auto-run guard, connection via `../db.js`.
   - `export async function planBackfill(collection)` - pure read. Returns one row per document that
     needs work: `{ _id, character_id, indices: number[] }`, where `indices` are the positions in
     `facts[]` whose fact has no `fact_key`. A document needing nothing is **omitted entirely** from
     the result (same "empty means nothing to do" contract as the two prior scripts).
   - `export async function applyBackfill(collection, rows, { apply = false, log = () => {} } = {})` -
     dry-run narrates; `--apply` writes the backup to
     `server/scripts/_backups/dbo-2-dossier-fact-key-<ISO>.json` first and aborts writing anything if
     that backup write throws. Returns `{ documentsTouched, factsStamped, backedUp }`.
   - `export async function main(argv = process.argv)` - prints mode and target database before doing
     anything, same as both prior scripts.
   - **Write shape, and this part is load-bearing rather than a style preference.** The whole problem
     `fact_key` exists to solve is that `facts[]` is positionally addressed, so the migration must not
     itself be vulnerable to the hazard it is fixing. Per document, per index:
     `updateOne({ _id, [`facts.${i}.fact_key`]: { $exists: false } }, { $set: { [`facts.${i}.fact_key`]: mint() } })`.
     The `$exists: false` filter makes the write self-guarding: it is a no-op if that slot already
     gained a key since planning, and it sets exactly one field, so it can never clobber a concurrent
     edit to any other field of that fact. Do **not** `$set` the whole `facts` array, and do **not**
     trust the stale plan's indices without the filter - the three prior DBO scripts each acquired a
     stale-plan / TOCTOU guard during code review, and this is that guard designed in from the start.
   - **Re-derive from a fresh read at write time**, matching the pattern DBO-1's and DBO-8's own
     reviews established: the same read that produces the backup is the one the write decisions come
     from.
   - **Idempotent.** Re-running `planBackfill` after a successful `--apply` returns `[]`. An existing
     `fact_key` is never overwritten, never regenerated, never normalised.

6. **The safety invariant is proven against real documents, not asserted.** A test seeds fixtures in
   `tm_suite_test` covering every live shape (a fact with only the four required fields; a
   `secret`-tagged fact with `severity` / `compromised` / `note`; a `boon` / `debt` fact with
   `counterparty` / `status` / `since`; a fact with `sheet_field` / `sheet_value` / `clash`; a fact
   with `npc_id: null`; and a fact that **already** carries a `fact_key`), runs
   `applyBackfill({ apply: true })`, then asserts:
   - Every fact gained a `fact_key`; the pre-stamped one kept its original value byte-for-byte.
   - Every other field of every fact is byte-for-byte identical to before - in particular **every
     `st_hidden` is still `true` and no fact gained a `revealed_to`**. Assert the whole fact object
     minus `fact_key`, not a count.
   - Minted keys are unique across every fact in the fixture set (not merely non-empty).
   - A second `planBackfill` returns `[]` (idempotency), and a second `applyBackfill({ apply: true })`
     stamps zero.
   - A stale-plan test: plan a document, stamp one of its facts out from under the plan, then apply the
     stale plan and assert the out-of-band key survived unchanged.
   - Tests must be scoped to their own fixtures - `tm_suite_test.character_dossier` is a shared
     collection and `setupDb()` only asserts the database name ends in `_test`; it does not isolate.
     Filter `planBackfill`'s result to this suite's own fixture `_id`s before every
     `applyBackfill(..., { apply: true })` call. (DBO-1's external review found exactly this defect in
     DBO-1's own tests; do not repeat it.)

7. **Schema validation tests cover the real shapes.** Direct Ajv tests
   (`new Ajv({ allErrors: true, strict: false })`, matching `dbo-1-purchasable-powers-schema-cleanup.test.js`'s
   own usage) against `characterDossierSchema`:
   - A document shaped like a real live one (ObjectId-ish `character_id`, `source`, `updated_at`, a
     facts array) with `fact_key` present on every fact **validates**.
   - The same document with `fact_key` absent from one fact **fails**, and the failing keyword is
     `required` on `fact_key` - this is the assertion that proves AC2's transitional state is real and
     visible rather than a comment nobody enforces.
   - `st_hidden` absent from one fact **fails** (AC3).
   - `character_id` as a plain string **validates**, and as an object **validates** (both are the
     declared tolerance).
   - An undeclared field on a fact **fails**, naming that field as the `additionalProperty` - proving
     `additionalProperties: false` is genuinely closed at the fact level, not just the document level.
   - `severity: 'catastrophic'` **fails**; `status: 'settled'` **validates** (proving the deliberate
     enum / no-enum split in AC1 is what actually shipped).
   - `revealed_to: ['someid']` **validates** (declared), and a fact with no `revealed_to` **validates**
     (optional).

8. **`_dossier-audit.js`'s import is proven fixed.** The audit script cannot be imported by a test:
   it connects to Mongo with a top-level `await` at module load (`:4-6`) using `MONGODB_URI` and hard-
   codes `db('tm_suite')` - importing it in a test would connect to **live** data. So prove it two
   ways instead:
   - A direct `import { DOSSIER_TAGS } from '../schemas/character_dossier.schema.js'` in the test file
     itself resolves and yields an array of exactly the 26 tags - the same specifier the audit script
     uses, from the same relative depth, so a resolution failure would fail this test.
   - A source-contract check that `server/scripts/_dossier-audit.js` still imports `DOSSIER_TAGS` from
     `../schemas/character_dossier.schema.js`, anchored to line-start with the `m` flag so a
     commented-out import cannot false-pass (the exact false-pass DBO-9's own review found and fixed).

## Tasks / Subtasks

- [x] Task 1 - Write the schema (AC: 1, 2, 3, 4)
  - [x] New `server/schemas/character_dossier.schema.js` following `relationship.schema.js` /
        `npc_flag.schema.js` conventions.
  - [x] Export `characterDossierSchema`, `DOSSIER_TAGS` (26), `DOSSIER_FACT_SOURCES` (4), and a named
        `severity` enum const if that reads cleaner alongside the sub-schema.
  - [x] Declare every field in the live inventory, plus `fact_key` and `revealed_to`.
  - [x] Header comment covering: why the file was missing, the `fact_key` contract's three invariants,
        the transitional `required`-fails-live-data state, the `st_hidden` fail-open rationale, and a
        pointer to `specs/epic-dbo-database-ownership.md`'s DBO-2 section rather than re-narrating the
        investigation inline.
  - [x] Confirm `server/scripts/_dossier-audit.js:3`'s import now resolves; edit that script only if it
        genuinely needs it, and record which in the File List.
- [x] Task 2 - Schema validation tests (AC: 7, 8)
  - [x] Ajv tests per AC7, using real-shaped fixtures derived from the live inventory above, not bare
        stubs.
  - [x] The two `_dossier-audit.js` proofs per AC8. Do **not** import the audit script itself.
- [x] Task 3 - Backfill script (AC: 5)
  - [x] New `server/scripts/dbo-2-dossier-fact-key-backfill.mjs` with `planBackfill` / `applyBackfill` /
        `main`, per AC5's exact shape.
  - [x] `randomUUID` from `node:crypto`; no new dependency added to `server/package.json`.
  - [x] Per-index `$exists: false`-guarded `$set`, fresh read at write time, backup before any write,
        abort on backup failure.
- [x] Task 4 - Backfill script tests (AC: 6)
  - [x] `tm_suite_test`-backed fixtures covering every live fact shape, scoped to this suite's own
        `_id`s before any apply-mode call.
  - [x] Byte-for-byte non-mutation assertions on `st_hidden` and `revealed_to`, uniqueness, idempotency,
        never-overwrite, stale-plan guard.
  - [x] Note whether Mongo was genuinely reachable in this environment. A skipped suite is not a passing
        suite; read the summary line, not the exit code.
- [x] Task 5 - Targeted gate and prove-discrimination
  - [x] Run this story's own new test files plus any existing suite that touches `server/schemas/` or
        `server/scripts/` conventions. Report the real pass / fail / skip counts, accounting for the
        `CLAUDE.md`-documented pre-existing failures (#1115, and the two `deferred-work.md` entries
        DBO-9 logged) rather than folding them into a clean number.
  - [x] Prove-discrimination: invert exactly one guard (for example, drop the `$exists: false` from the
        update filter, or remove `fact_key` from the schema's `required`) and confirm precisely the
        tests protecting that invariant fail and nothing else; then restore and re-verify green.
- [x] Task 6 - Hand-off record (AC: none; documentation)
  - [x] Update `specs/epic-dbo-database-ownership.md`'s DBO-2 section to record what actually shipped
        and that the reveal writer is TM Wiki's, not this repo's.
  - [x] Record in the story that **TM Wiki must be told the mint has landed** once Angelus has run
        `--apply`, so they can backfill-verify and decide when to flip
        `wiki_config.fact_level_enabled`. That notification is not this story's action, but the
        dependency needs to be visible somewhere durable.

## Dev Notes

### Running the backfill for real is Angelus's action, not an agent's

Same standing convention as DBO-1's cleanup script, DBO-4's office migration, and DBO-8's edge
cleanup. Build it, test it against `tm_suite_test`, leave it dry-run-by-default. The dry-run default
means running it bare against the configured database is always safe, but do not pass `--apply` at a
live target under any circumstances. A bare dry-run against live `tm_suite` as a sanity check (does the
plan really find 442 facts across 30 documents?) is read-only and matches what DBO-1 and DBO-8 both
did; that is fine and worth doing.

### The residual hazard, named now rather than discovered later

`server/scripts/_havens-and-locations.js:46` `$push`es a new fact onto `facts[]` with no `fact_key`.
It is a one-off, already-run script and this story deliberately does not touch it (see "What this story
is NOT"), but re-running it after the backfill would create a keyless fact - the same class of finding
DBO-1's own review made against `seed-rules-necropolis.js`, and the same conclusion: not unsafe to
ship, but the end state is not durable against a real workflow. Log it in `specs/deferred-work.md`
rather than expanding this story's scope. Any *future* writer of dossier facts, in this repo or
elsewhere, must mint a `fact_key`; that is what the schema's `required` exists to say.

### Why the schema is documentation plus a test contract, not a runtime validator

Nothing in `server/routes/` reads or writes `character_dossier` at all - confirmed by grep; the only
writers in this repo are one-off `server/scripts/_*.js` tools. Live `character_dossier` carries no
`$jsonSchema` validator (confirmed via `listCollections`; `_dossier-audit.js:50` prints exactly this).
So `required: ['fact_key']` cannot break anything at runtime today. Adding a DB-level validator is a
separate, riskier decision and is explicitly out of scope.

### Architecture compliance

- **No CSS, no UI, no markup.** Schema plus one-off script plus tests.
- **British English, no em-dashes** in any comment or string this story writes.
- **Mongo script conventions**: dry-run default, `--apply` to write, JSON backup before any write, no
  shebang on any script a test imports, pure `plan` / `apply` functions taking the collection as an
  argument so tests can never reach live data by accident, `MONGODB_DB` override.
- **No new npm dependency.** `randomUUID` is built in. If a developer believes nanoid or ulid is
  genuinely needed instead, that is a deviation to raise and record, not to take silently - see AC2 for
  why the built-in was chosen.
- **New reference data defaults to MongoDB-backed** (`CLAUDE.md`). Nothing in this story introduces a
  static JS reference-data module; `DOSSIER_TAGS` is a schema-adjacent inventory serving one audit
  script, not a rules table.

### Project Structure Notes

- New files: `server/schemas/character_dossier.schema.js`,
  `server/scripts/dbo-2-dossier-fact-key-backfill.mjs`, and the test file(s) - one combined
  `server/tests/dbo-2-dossier-fact-key.test.js` or a schema / script split, developer's call; record
  the actual split in the File List.
- Possibly modified: `server/scripts/_dossier-audit.js` (only if its line-3 import genuinely needs an
  edit; it should not).
- Deliberately unchanged: every `server/routes/*.js`, everything under `public/`, every other
  `server/scripts/_*.js`, `server/package.json`, and both other repos.

### References

- [Source: `specs/epic-dbo-database-ownership.md`, DBO-2 section] - the full investigation, Angelus's
  decision, and the two original defects.
- [Source: `../TM Wiki/specs/tm-wiki-schema.md`, "## The fact_key dependency"] - the authoritative
  contract this story satisfies, quoted above, including the "flip the flag, no wiki schema change
  needed" unblocking condition.
- [Source: `../TM Wiki/server/wiki-schemas/visibility-prefs.schema.js`] - the already-built reveal
  mechanism. `SUBJECT_TYPES` includes `'fact'`; the `allOf` arm for it requires
  `subject_ref: { fact_key: { type: 'string', minLength: 1 } }`, which is why a UUID string satisfies
  their contract without a change on their side.
- [Source: `../TM Wiki/server/routes/characters.js:210-229`] - `filterVisibleFacts`'s fail-open
  `st_hidden` read (AC3's rationale), and the already-self-corrected dead citation.
- [Source: `../TM Cockpit/lib/connect.mjs`] - the seven-collection credential scope that rules Cockpit
  out as the reveal writer's home.
- [Source: `server/scripts/_dossier-audit.js`] - the broken import this story closes, and the
  drift-reporting semantics that argue against enum-ing `tag`.
- [Source: `server/scripts/dbo-8-orphaned-touchstone-edges-cleanup.mjs`] - the `plan` / `apply` / `main`
  shape, header-comment conventions, backup-before-write, and the write-time re-check guard this
  story's script mirrors.
- [Source: `server/scripts/dbo-1-purchasable-powers-field-cleanup.mjs`] - the same conventions from the
  other direction, plus the fixture-scoping lesson its own review produced (AC6's last bullet).
- [Source: `server/schemas/relationship.schema.js`, `server/schemas/npc_flag.schema.js`] - the schema
  file conventions AC1 follows.
- [Source: `specs/stories/dbo-1-purchasable-powers-schema-vs-data.md`] - the closest prior story in
  shape (schema declaration plus a one-off cleanup script plus `tm_suite_test`-backed tests).

## Dev Agent Record

### Agent Model Used

claude-opus-5[1m] (Opus 5, 1M context), via the `bmad-dev-story` workflow, 2026-08-14.

### Debug Log References

- Red-first proof: the new test file was written before any implementation and failed with
  `Error: Cannot find module '../schemas/character_dossier.schema.js'` - the exact
  `ERR_MODULE_NOT_FOUND` class of failure `_dossier-audit.js:3` has been hitting, reproduced from a
  test at the same relative depth.
- DB reachability was confirmed BEFORE relying on it, by running an existing DB-backed suite
  (`dbo-8-orphaned-touchstone-edges-cleanup.test.js`): 5 passed, 0 skipped. Mongo/Atlas is genuinely
  reachable in this environment, so nothing in this story's DB-backed half was silently skipped.
- Read-only live inventory re-derived from `tm_suite` rather than trusting the story's numbers, and
  it matched every figure exactly: 30 documents, 442 facts, 26 tags, `_id` and `character_id` both
  BSON ObjectId on all 30, `updated_at` a string on all 30, `source` a string on 29, `source_note` on
  1, fact `npc_id` string:18 / null:6, `severity` major:10 / life_threatening:2 / minor:1, `status`
  outstanding:9, `compromised` true:10 / false:3, `fact_key` on 0, `revealed_to` on 0, `st_hidden`
  true on 442 of 442.
- Bare dry-run of the new script against live `tm_suite` (read-only, no `--apply`, blessed by this
  story's own Dev Notes): `Mode: DRY RUN`, `Target DB: tm_suite`,
  `character_dossier: 30 document(s) / 442 fact(s) need a fact_key`,
  `Totals: 0 fact(s) stamped across 0 document(s), 0 document(s) backed up`. Nothing written.
- The seven load-failing suites in the targeted gate were verified pre-existing by `git stash push -u`
  of this story's three new files and re-running the same seven against the unmodified base: identical
  7 failures, `Tests: no tests`. Restored with `git stash pop`, all three files verified present.

### Completion Notes List

**`_dossier-audit.js` was NOT edited, and did not need to be.** Its line-3 specifier
(`../schemas/character_dossier.schema.js`) was already correct - only the target file was missing.
The file is byte-identical and is deliberately absent from the File List's "modified" section. AC8's
source-contract test pins that specifier, anchored to line-start with the `m` flag, so a future edit
or comment-out cannot silently re-break it.

**Deliberate additions beyond the letter of AC1, both small and both for honesty rather than scope.**
(1) `_id` is declared `{ type: ['string', 'object'] }` rather than `{ type: 'string' }`: AC1 lists
`_id` among the declared properties but does not fix its type, and the live inventory shows a BSON
ObjectId on all 30 documents, so the same tolerance `character_id` gets is the only honest
declaration. Declaring it `'string'` would have been the same dishonesty this schema exists to end.
(2) `DOSSIER_SEVERITIES` is exported as a named const, which AC1's own "a named `severity` enum const
if that reads cleaner" clause explicitly permits; the schema references it rather than inlining the
three values.

**Prove-discrimination, two guards, three inversions.** Each was a single-change revert, restored and
re-verified green afterwards.

1. *Schema `required` on `fact_key` removed* -> exactly 1 test failed
   (`AC2 - fails when fact_key is absent from one fact, and the failing keyword is required`),
   24 passed. Restored, 25/25.
2. *Write-path never-re-stamp guard.* This invariant is implemented in TWO layers - an in-memory
   `hasOwnProperty` skip re-derived from the fresh backup read, and the DB-level
   `{ 'facts.N.fact_key': { $exists: false } }` filter on the update itself. Removing either layer
   ALONE left all 25 tests green, which is the honest finding: the layers are genuine defence in
   depth, and no single-layer inversion discriminates. Removing BOTH (one logical guard, fully
   inverted) failed exactly 2 tests and nothing else - `AC6 - is idempotent: a second plan is empty
   and a re-applied stale plan stamps zero` and `AC6 - a stale plan never overwrites a key stamped
   out of band between plan and apply` - 23 passed. Restored, 25/25.

**Test results, real counts, not folded.**

- This story's own suite: `server/tests/dbo-2-dossier-fact-key.test.js` - **25 passed, 0 failed,
  0 skipped** (14 Ajv schema tests, 3 export / import-contract tests, 8 `tm_suite_test`-backed script
  tests). The DB-backed 8 genuinely ran; a skip would have shown as a lower total.
- Targeted gate, every `server/tests/*.test.js` that imports from `../schemas/` or `../scripts/`
  (18 files) plus this story's own suite plus `dbo-9` and `dbo-3` for adjacency - 21 files:
  **255 passed, 0 failed, 0 skipped, 14 files passed, 7 files failed to LOAD.**
- All 7 load failures are pre-existing and proven so against the stashed base (see Debug Log). Two
  are already documented: `n8-mandragora-prereq.test.js` (logged by DBO-9) and
  `oxp-1-office-seats.test.js` (the `seed-office-seats.mjs` shebang failure oxp-11's record names).
  The other five - `issue-1013-indomitable-rules-text`, `issue-1021-failed-breakpoint-merit`,
  `issue-811-sumchannels-rootcause`, `issue-826-cleanup-script-integration`,
  `issue-837-xp-totals-deprecation` - share the same `SyntaxError: Invalid or unexpected token`
  symptom and appear undocumented; all five newly logged to `specs/deferred-work.md`.
- `#1115` (`n7-n9-allocator-readers.test.js`) is NOT in this gate: it imports from neither
  `server/schemas/` nor `server/scripts/`, so it is out of the changed area and was not run.

**British English, no em-dashes, no smart quotes, no NUL bytes** verified programmatically across all
three new files (regex sweep for U+2014, U+2013, U+2018, U+2019, U+201C, U+201D and U+0000: clean).

**Live `tm_suite` was never written to.** No `--apply` was passed at any target, live or test. Only
`applyBackfill(..., { apply: true })` inside vitest against `tm_suite_test` ever wrote anything.
`server/package.json` is unchanged - `randomUUID()` from `node:crypto` needs no dependency.

**HAND-OFF, and this is the durable record of it: when Angelus runs
`node scripts/dbo-2-dossier-fact-key-backfill.mjs --apply` from `server/` against live `tm_suite`,
TM Wiki must be told the mint has landed.** They can then backfill-verify and decide when to flip
`wiki_config.fact_level_enabled`. Their own spec's unblocking condition is that no wiki schema change
is needed - `fact_key` was always in `visibility_prefs`, just gated. That notification is not this
story's action, and the flag is not this repo's to flip. Also recorded in the script's own `main()`
output on a successful apply, and in `specs/epic-dbo-database-ownership.md`'s DBO-2 section.

### File List

**New:**

- `server/schemas/character_dossier.schema.js` - the schema, `DOSSIER_TAGS` (26),
  `DOSSIER_FACT_SOURCES` (4), `DOSSIER_SEVERITIES` (3).
- `server/scripts/dbo-2-dossier-fact-key-backfill.mjs` - `planBackfill` / `applyBackfill` / `main`,
  dry-run by default.
- `server/tests/dbo-2-dossier-fact-key.test.js` - one combined suite (schema + audit-import contract +
  backfill script), 25 tests. The story left the schema / script test split to the developer; combined
  matches DBO-1's own precedent.

**Modified (documentation and tracking only, no code):**

- `specs/stories/dbo-2-character-dossier-schema-and-reveal.md` - this record, Tasks, Status.
- `specs/epic-dbo-database-ownership.md` - DBO-2 section gained a "SHIPPED 2026-08-14" subsection.
- `specs/deferred-work.md` - the `_havens-and-locations.js:46` keyless-`$push` hazard, and the seven
  pre-existing load failures.
- `specs/stories/sprint-status.yaml` - the `dbo-2-character-dossier-schema-and-reveal` row.

**Deliberately unchanged, confirmed:**

- `server/scripts/_dossier-audit.js` - byte-identical; its import needed no edit.
- `server/package.json` - no dependency added.
- Every `server/routes/*.js`, everything under `public/`, every other `server/scripts/_*.js`, and both
  other repos.
